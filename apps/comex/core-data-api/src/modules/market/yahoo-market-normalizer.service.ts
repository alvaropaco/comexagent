import { Injectable } from '@nestjs/common';
import { MarketQuote } from './yahoo-market-data.service';

export type NormalizedMarketData = {
  commodity: 'coffee' | 'pepper' | null;
  symbol: string;
  price: number | null;
  change_percent: number | null;
  trend: 'bullish' | 'bearish' | 'flat' | null;
  currency: string | null;
  source: 'yahoo_finance';
  type: 'futures';
  timestamp: string | null;
};

function commodityFromSymbol(symbol: string): 'coffee' | 'pepper' | null {
  const s = (symbol ?? '').toUpperCase();
  if (s.startsWith('KC')) return 'coffee';
  return null;
}

@Injectable()
export class YahooMarketNormalizerService {
  normalize(raw: MarketQuote): NormalizedMarketData {
    const change = raw.changePercent;
    const trend =
      typeof change === 'number'
        ? change > 0
          ? 'bullish'
          : change < 0
            ? 'bearish'
            : 'flat'
        : null;

    return {
      commodity: commodityFromSymbol(raw.symbol),
      symbol: raw.symbol,
      price: raw.price,
      change_percent: raw.changePercent,
      trend,
      currency: raw.currency,
      source: 'yahoo_finance',
      type: 'futures',
      timestamp: raw.timestamp,
    };
  }
}
