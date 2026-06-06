import { Injectable } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

type Cached<T> = { expiresAt: number; value: T };

export type RawYahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  currency?: string;
  regularMarketTime?: number;
};

export type MarketQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  currency: string | null;
  timestamp: string | null;
};

function toIso(ts: unknown): string | null {
  if (ts instanceof Date) {
    try {
      return ts.toISOString();
    } catch {
      return null;
    }
  }
  if (typeof ts === 'number') {
    try {
      const ms = ts > 10_000_000_000 ? ts : ts * 1000;
      return new Date(ms).toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

@Injectable()
export class YahooMarketDataService {
  private readonly yahoo = new YahooFinance();
  private cache = new Map<string, Cached<MarketQuote>>();

  async getQuote(
    symbol: string,
    ttlSeconds = 60,
    forceRefresh = false,
  ): Promise<MarketQuote> {
    const key = this.resolveSymbol((symbol ?? '').trim().toUpperCase());
    if (!key) throw new Error('missing_symbol');

    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const raw = await withTimeout(
      this.yahoo.quote(key) as unknown as Promise<RawYahooQuote>,
      6000,
    );

    if (!raw || (!raw.symbol && raw.regularMarketPrice == null)) {
      throw new Error('quote_not_found');
    }

    const normalized: MarketQuote = {
      symbol: raw.symbol ?? key,
      price:
        typeof raw.regularMarketPrice === 'number'
          ? raw.regularMarketPrice
          : null,
      changePercent:
        typeof raw.regularMarketChangePercent === 'number'
          ? raw.regularMarketChangePercent
          : null,
      high:
        typeof raw.regularMarketDayHigh === 'number'
          ? raw.regularMarketDayHigh
          : null,
      low:
        typeof raw.regularMarketDayLow === 'number' ? raw.regularMarketDayLow : null,
      volume:
        typeof raw.regularMarketVolume === 'number'
          ? raw.regularMarketVolume
          : null,
      currency: typeof raw.currency === 'string' ? raw.currency : null,
      timestamp: toIso(raw.regularMarketTime),
    };

    this.cache.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value: normalized,
    });
    return normalized;
  }

  private resolveSymbol(symbol: string) {
    const s = (symbol ?? '').trim();
    if (!s) return s;
    if (/^KCK\d$/i.test(s)) return 'KC=F';
    if (s === 'KCK6') return 'KC=F';
    return s;
  }
}
