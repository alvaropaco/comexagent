import { Injectable } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

type Tick = { price: number; timestamp: string };

type Level4CoffeeMarketData = {
  ticks_1m: Tick[];
  ticks_5m: Tick[];
  ticks_1h: Tick[];
  volume: number;
  avgVolume: number;
  previousClose: number;
  high: number;
  low: number;
  price: number;
  currency: string;
  fetchedAt: string;
  timestamp: string | null;
  symbol: string;
  exchange: string;
};

function toIsoSeconds(tsSeconds: number): string | null {
  try {
    return new Date(tsSeconds * 1000).toISOString();
  } catch {
    return null;
  }
}

function toFloat(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function extractLast3Ticks(payload: unknown): Tick[] | null {
  const chart = (payload as any)?.chart;
  const result = Array.isArray(chart?.result) ? chart.result[0] : null;
  const tsArr = Array.isArray(result?.timestamp) ? result.timestamp : null;
  const closes = Array.isArray(result?.indicators?.quote)
    ? result.indicators.quote?.[0]?.close
    : null;

  if (!Array.isArray(tsArr) || !Array.isArray(closes) || tsArr.length !== closes.length) return null;

  const pairs: Array<{ ts: number; price: number }> = [];
  for (let i = 0; i < tsArr.length; i++) {
    const ts = tsArr[i];
    const px = closes[i];
    const tsNum = typeof ts === 'number' ? ts : null;
    const pxNum = toFloat(px);
    if (tsNum == null || pxNum == null || pxNum <= 0) continue;
    pairs.push({ ts: Math.floor(tsNum), price: pxNum });
  }
  if (pairs.length < 3) return null;
  const last3 = pairs.slice(-3);
  const ticks: Tick[] = [];
  for (const p of last3) {
    const iso = toIsoSeconds(p.ts);
    if (!iso) return null;
    ticks.push({ price: p.price, timestamp: iso });
  }
  return ticks;
}

async function fetchChart(symbol: string, interval: string, range: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const resp = await fetch(url, {
    headers: {
      'user-agent': 'comex-core-data-api/1.0',
      accept: 'application/json,text/plain,*/*',
    },
  });
  if (!resp.ok) {
    throw new Error(`http_${resp.status}`);
  }
  return await resp.json();
}

@Injectable()
export class YahooChartService {
  private readonly yahoo = new YahooFinance();
  private cache?: { expiresAt: number; value: Level4CoffeeMarketData };

  async getCoffeeLevel4(ttlSeconds = 60): Promise<Level4CoffeeMarketData> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }

    const symbol = 'KC=F';
    const fetchedAt = new Date().toISOString();

    const [c1, c5, c1h, q] = await Promise.all([
      fetchChart(symbol, '1m', '1d'),
      fetchChart(symbol, '5m', '1d'),
      fetchChart(symbol, '1h', '5d'),
      this.yahoo.quote(symbol) as unknown as Promise<any>,
    ]);

    const meta = (c1 as any)?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta !== 'object') {
      throw new Error('empty_meta');
    }

    const price = toFloat(meta.regularMarketPrice ?? q?.regularMarketPrice);
    const high = toFloat(meta.regularMarketDayHigh ?? q?.regularMarketDayHigh);
    const low = toFloat(meta.regularMarketDayLow ?? q?.regularMarketDayLow);
    const previousClose = toFloat(meta.previousClose ?? q?.previousClose);
    const volume = toFloat(meta.regularMarketVolume ?? q?.regularMarketVolume);
    const avgVolume = toFloat(
      q?.averageDailyVolume3Month ??
        q?.averageDailyVolume10Day ??
        q?.averageVolume ??
        null,
    );
    const currency =
      typeof meta.currency === 'string'
        ? meta.currency
        : typeof q?.currency === 'string'
          ? q.currency
          : null;
    const timestamp = typeof meta.regularMarketTime === 'number' ? toIsoSeconds(meta.regularMarketTime) : null;

    const ticks_1m = extractLast3Ticks(c1);
    const ticks_5m = extractLast3Ticks(c5);
    const ticks_1h = extractLast3Ticks(c1h);

    if (
      price == null ||
      high == null ||
      low == null ||
      previousClose == null ||
      volume == null ||
      avgVolume == null ||
      !currency ||
      !ticks_1m ||
      !ticks_5m ||
      !ticks_1h
    ) {
      throw new Error('invalid_payload');
    }
    if (high < low) {
      throw new Error('invalid_range');
    }

    const data: Level4CoffeeMarketData = {
      ticks_1m,
      ticks_5m,
      ticks_1h,
      volume,
      avgVolume,
      previousClose,
      high,
      low,
      price,
      currency,
      fetchedAt,
      timestamp,
      symbol: typeof meta.symbol === 'string' ? meta.symbol : symbol,
      exchange:
        typeof meta.fullExchangeName === 'string'
          ? meta.fullExchangeName
          : typeof meta.exchangeName === 'string'
            ? meta.exchangeName
            : '',
    };

    this.cache = { expiresAt: Date.now() + ttlSeconds * 1000, value: data };
    return data;
  }
}
