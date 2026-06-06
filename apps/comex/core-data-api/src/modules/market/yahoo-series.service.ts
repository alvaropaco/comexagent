import { Injectable } from '@nestjs/common';

type TickPoint = { price: number; timestamp: string };
type Cached<T> = { expiresAt: number; value: T };

type ChartSeries = {
  symbol: string;
  interval: string;
  range: string;
  currency: string | null;
  fetchedAt: string;
  series: TickPoint[];
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

function extractSeries(payload: unknown): { currency: string | null; series: TickPoint[] } {
  const result = (payload as any)?.chart?.result?.[0];
  const meta = result?.meta;
  const currency = typeof meta?.currency === 'string' ? meta.currency : null;
  const tsArr = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const closes = Array.isArray(result?.indicators?.quote) ? result.indicators.quote?.[0]?.close : [];

  const out: TickPoint[] = [];
  if (!Array.isArray(tsArr) || !Array.isArray(closes)) return { currency, series: out };
  const n = Math.min(tsArr.length, closes.length);
  for (let i = 0; i < n; i++) {
    const ts = tsArr[i];
    const px = toFloat(closes[i]);
    if (typeof ts !== 'number' || px == null || px <= 0) continue;
    const iso = toIsoSeconds(Math.floor(ts));
    if (!iso) continue;
    out.push({ price: px, timestamp: iso });
  }
  return { currency, series: out };
}

@Injectable()
export class YahooSeriesService {
  private cache = new Map<string, Cached<ChartSeries>>();

  async getSeries(
    symbol: string,
    interval: string,
    range: string,
    ttlSeconds = 120,
    forceRefresh = false,
  ): Promise<ChartSeries> {
    const s = (symbol || '').trim().toUpperCase() || 'KC=F';
    const key = `${s}:${interval}:${range}`;

    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
    }

    const fetchedAt = new Date().toISOString();
    const payload = await fetchChart(s, interval, range);
    const { currency, series } = extractSeries(payload);
    if (!series || series.length < 3) {
      throw new Error('insufficient_series');
    }

    const value: ChartSeries = { symbol: s, interval, range, currency, fetchedAt, series };
    this.cache.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
    return value;
  }
}
