import { Injectable } from '@nestjs/common';
import { YahooMarketDataService } from './yahoo-market-data.service';

type CommodityMover = {
  symbol: string;
  changePercent: number;
  currency: string | null;
  timestamp: string | null;
};

type Cached<T> = { expiresAt: number; value: T };

@Injectable()
export class YahooMoversService {
  constructor(private readonly market: YahooMarketDataService) {}

  private cache?: Cached<{ fetchedAt: string; movers: CommodityMover[] }>;

  async getCommodityMovers(ttlSeconds = 60): Promise<{ fetchedAt: string; movers: CommodityMover[] }> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }

    const fetchedAt = new Date().toISOString();
    const symbols = [
      'KC=F',
      'SB=F',
      'CT=F',
      'CC=F',
      'OJ=F',
      'GC=F',
      'SI=F',
      'HG=F',
      'CL=F',
      'NG=F',
      'ZC=F',
      'ZW=F',
      'ZS=F',
    ];

    const quotes = await Promise.all(
      symbols.map(async (s) => {
        try {
          return await this.market.getQuote(s, ttlSeconds);
        } catch {
          return null;
        }
      }),
    );

    const movers: CommodityMover[] = quotes
      .filter((q): q is NonNullable<typeof q> => !!q)
      .filter((q) => typeof q.changePercent === 'number' && Number.isFinite(q.changePercent))
      .map((q) => ({
        symbol: q.symbol,
        changePercent: q.changePercent as number,
        currency: q.currency ?? null,
        timestamp: q.timestamp ?? null,
      }))
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    const value = { fetchedAt, movers };
    this.cache = { expiresAt: Date.now() + ttlSeconds * 1000, value };
    return value;
  }
}

