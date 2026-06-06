import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketTick, MarketTickDocument, MarketTimeframe } from './market-tick.schema';
import { YahooMarketDataService } from './yahoo-market-data.service';
import { YahooSeriesService } from './yahoo-series.service';

function toDate(value: string | null): Date | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  const anyErr = err as any;
  return anyErr?.code === 11000;
}

function rangeForTimeframe(timeframe: MarketTimeframe): string {
  if (timeframe === '1h') return '5d';
  return '1d';
}

@Injectable()
export class MarketIngestionService {
  constructor(
    @InjectModel(MarketTick.name)
    private readonly tickModel: Model<MarketTickDocument>,
    private readonly yahooMarket: YahooMarketDataService,
    private readonly yahooSeries: YahooSeriesService,
  ) {}

  async ingestLatestTick(p: {
    symbol: string;
    timeframe: MarketTimeframe;
    commodity?: string;
    source?: string;
  }): Promise<{ inserted: boolean; tick: MarketTick | null; reason?: string }> {
    const symbol = (p.symbol ?? '').trim().toUpperCase();
    if (!symbol) return { inserted: false, tick: null, reason: 'missing_symbol' };

    const timeframe = p.timeframe;
    const ingestedAt = new Date();
    const source = p.source ?? 'yahoo_finance';

    const [quote, series] = await Promise.all([
      this.yahooMarket.getQuote(symbol, 0, true),
      this.yahooSeries.getSeries(
        symbol,
        timeframe,
        rangeForTimeframe(timeframe),
        0,
        true,
      ),
    ]);

    const lastPoint = series.series.at(-1);
    const timestamp = toDate(lastPoint?.timestamp ?? null) ?? toDate(quote.timestamp);
    if (!timestamp) {
      return { inserted: false, tick: null, reason: 'missing_timestamp' };
    }

    const price = typeof lastPoint?.price === 'number' ? lastPoint.price : quote.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return { inserted: false, tick: null, reason: 'missing_price' };
    }

    try {
      const created = await this.tickModel.create({
        commodity: p.commodity,
        symbol,
        price,
        high: quote.high ?? undefined,
        low: quote.low ?? undefined,
        volume: quote.volume ?? undefined,
        source,
        timeframe,
        timestamp,
        ingestedAt,
      });
      return { inserted: true, tick: created.toObject() };
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        const existing = await this.tickModel
          .findOne({ symbol, timeframe, timestamp })
          .lean();
        return { inserted: false, tick: existing as any };
      }
      return { inserted: false, tick: null, reason: String(e) };
    }
  }

  async ingestLatestForSymbol(p: {
    symbol: string;
    timeframes: MarketTimeframe[];
    commodity?: string;
  }): Promise<Array<{ timeframe: MarketTimeframe; inserted: boolean; reason?: string }>> {
    const timeframes: MarketTimeframe[] =
      Array.isArray(p.timeframes) && p.timeframes.length > 0
        ? p.timeframes
        : (['1m', '5m', '1h'] satisfies MarketTimeframe[]);
    const results: Array<{ timeframe: MarketTimeframe; inserted: boolean; reason?: string }> = [];
    for (const tf of timeframes) {
      try {
        const r = await this.ingestLatestTick({ symbol: p.symbol, timeframe: tf, commodity: p.commodity });
        results.push({ timeframe: tf, inserted: r.inserted, reason: r.reason });
      } catch (e) {
        results.push({ timeframe: tf, inserted: false, reason: String(e) });
      }
    }
    return results;
  }
}
