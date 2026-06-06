import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketIndex, MarketIndexDocument } from './market-index.schema';
import { MarketTick, MarketTickDocument, MarketTimeframe } from './market-tick.schema';

type Direction = 'upward' | 'downward' | 'mixed';
type Acceleration = 'accelerating' | 'decelerating' | 'stable';
type Signal = 'buy' | 'sell' | 'hold';

function isDuplicateKeyError(err: unknown): boolean {
  const anyErr = err as any;
  return anyErr?.code === 11000;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length - 1);
  return Math.sqrt(v);
}

function slope(prices: number[]): number {
  if (prices.length < 2) return 0;
  return (prices[prices.length - 1] - prices[0]) / (prices.length - 1);
}

function directionFrom(prices: number[]): Direction {
  if (prices.length < 2) return 'mixed';
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first <= 0) return 'mixed';
  const delta = (last - first) / first;
  if (delta > 0.001) return 'upward';
  if (delta < -0.001) return 'downward';
  return 'mixed';
}

function accelerationFrom(prices: number[]): Acceleration {
  if (prices.length < 6) return 'stable';
  const mid = Math.floor(prices.length / 2);
  const s1 = slope(prices.slice(0, mid));
  const s2 = slope(prices.slice(mid));
  const diff = s2 - s1;
  const scale = Math.max(1e-6, Math.abs(s1) + Math.abs(s2));
  const ratio = diff / scale;
  if (ratio > 0.25) return 'accelerating';
  if (ratio < -0.25) return 'decelerating';
  return 'stable';
}

function signalFrom(p: { direction: Direction; acceleration: Acceleration; volatility: number }): Signal {
  if (p.direction === 'upward' && p.acceleration === 'accelerating' && p.volatility < 1.25) {
    return 'buy';
  }
  if (p.direction === 'downward' && p.acceleration === 'accelerating' && p.volatility < 1.25) {
    return 'sell';
  }
  return 'hold';
}

function volatilityFrom(prices: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const p0 = prices[i - 1];
    const p1 = prices[i];
    if (p0 <= 0 || p1 <= 0) continue;
    rets.push(Math.log(p1 / p0) * 100);
  }
  return std(rets);
}

@Injectable()
export class MarketIndexingService {
  constructor(
    @InjectModel(MarketTick.name)
    private readonly tickModel: Model<MarketTickDocument>,
    @InjectModel(MarketIndex.name)
    private readonly indexModel: Model<MarketIndexDocument>,
  ) {}

  async computeAndStoreLatest(p: {
    symbol: string;
    timeframe: MarketTimeframe;
    lookback?: number;
    source?: string;
  }): Promise<{ computedAt: Date | null; inserted: number; reason?: string }> {
    const symbol = (p.symbol ?? '').trim().toUpperCase();
    if (!symbol) return { computedAt: null, inserted: 0, reason: 'missing_symbol' };

    const lookback = Math.max(10, Math.min(500, p.lookback ?? 80));
    const ticks = await this.tickModel
      .find({ symbol, timeframe: p.timeframe }, { price: 1, timestamp: 1 })
      .sort({ timestamp: -1 })
      .limit(lookback)
      .lean();

    if (!Array.isArray(ticks) || ticks.length < 10) {
      return { computedAt: null, inserted: 0, reason: 'insufficient_ticks' };
    }

    const ordered = ticks.slice().reverse();
    const prices = ordered
      .map((t) => (typeof (t as any).price === 'number' ? (t as any).price : null))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (prices.length < 10) {
      return { computedAt: null, inserted: 0, reason: 'invalid_prices' };
    }

    const computedAt = new Date((ordered[ordered.length - 1] as any).timestamp);
    if (Number.isNaN(computedAt.getTime())) {
      return { computedAt: null, inserted: 0, reason: 'invalid_computedAt' };
    }

    const direction = directionFrom(prices);
    const acceleration = accelerationFrom(prices);
    const volatility = volatilityFrom(prices);
    const trendScore = slope(prices) / Math.max(1e-6, prices[0]);
    const signal = signalFrom({ direction, acceleration, volatility });
    const signalScore = (direction === 'upward' ? 1 : 0) + (acceleration === 'accelerating' ? 1 : 0) + (signal === 'buy' ? 1 : 0);

    const metadata = { direction, acceleration, signal };
    const source = p.source ?? 'temporal_indexer';

    const docs: Array<Omit<MarketIndex, keyof { _id: any }>> = [
      {
        symbol,
        timeframe: p.timeframe,
        indexType: 'trend_score',
        value: Number.isFinite(trendScore) ? trendScore : 0,
        metadata,
        computedAt,
        source,
      },
      {
        symbol,
        timeframe: p.timeframe,
        indexType: 'volatility',
        value: Number.isFinite(volatility) ? volatility : 0,
        metadata,
        computedAt,
        source,
      },
      {
        symbol,
        timeframe: p.timeframe,
        indexType: 'signal_score',
        value: signalScore,
        metadata,
        computedAt,
        source,
      },
    ];

    let inserted = 0;
    for (const d of docs) {
      try {
        await this.indexModel.create(d as any);
        inserted++;
      } catch (e) {
        if (isDuplicateKeyError(e)) continue;
        return { computedAt, inserted, reason: String(e) };
      }
    }

    return { computedAt, inserted };
  }
}

