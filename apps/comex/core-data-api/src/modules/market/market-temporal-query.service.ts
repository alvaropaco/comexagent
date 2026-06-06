import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketIndex, MarketIndexDocument } from './market-index.schema';
import { MarketTick, MarketTickDocument, MarketTimeframe } from './market-tick.schema';

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeTimeframe(v: unknown): MarketTimeframe {
  const s = typeof v === 'string' ? (v.trim() as MarketTimeframe) : null;
  if (s === '1m' || s === '5m' || s === '1h') return s;
  return '1m';
}

@Injectable()
export class MarketTemporalQueryService {
  constructor(
    @InjectModel(MarketTick.name)
    private readonly tickModel: Model<MarketTickDocument>,
    @InjectModel(MarketIndex.name)
    private readonly indexModel: Model<MarketIndexDocument>,
  ) {}

  async tickerTape(p: { timeframe?: unknown; limit?: unknown }) {
    const timeframe = normalizeTimeframe(p.timeframe);
    const limit = clampInt(p.limit, 50, 1, 200);
    const ticks = await this.tickModel
      .find({ timeframe })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    return { timeframe, ticks };
  }

  async marketChart(p: { symbol?: unknown; timeframe?: unknown; limit?: unknown }) {
    const symbol = typeof p.symbol === 'string' && p.symbol.trim() ? p.symbol.trim().toUpperCase() : 'KC=F';
    const timeframe = normalizeTimeframe(p.timeframe);
    const limit = clampInt(p.limit, 500, 10, 2000);
    const ticks = await this.tickModel
      .find({ symbol, timeframe })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();
    return { symbol, timeframe, ticks };
  }

  async marketIndexes(p: { symbol?: unknown; timeframe?: unknown; limit?: unknown }) {
    const symbol = typeof p.symbol === 'string' && p.symbol.trim() ? p.symbol.trim().toUpperCase() : 'KC=F';
    const timeframe = normalizeTimeframe(p.timeframe);
    const limit = clampInt(p.limit, 100, 1, 500);
    const indexes = await this.indexModel
      .find({ symbol, timeframe })
      .sort({ computedAt: -1 })
      .limit(limit)
      .lean();
    return { symbol, timeframe, indexes };
  }
}

