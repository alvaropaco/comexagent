import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { MarketTimeframe } from './market-tick.schema';

export type MarketIndexDocument = HydratedDocument<MarketIndex>;

const MARKET_TIMEFRAMES: MarketTimeframe[] = ['1m', '5m', '1h'];

@Schema({ collection: 'market_indexes', timestamps: true })
export class MarketIndex {
  @Prop({ required: true, index: true })
  symbol: string;

  @Prop({ required: true, index: true })
  indexType: string;

  @Prop({ required: true })
  value: number;

  @Prop({ type: Object, required: false })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, index: true, type: String, enum: MARKET_TIMEFRAMES })
  timeframe: MarketTimeframe;

  @Prop({ required: true, index: true })
  computedAt: Date;

  @Prop({ required: true })
  source: string;
}

export const MarketIndexSchema = SchemaFactory.createForClass(MarketIndex);

MarketIndexSchema.index({ symbol: 1, timeframe: 1, indexType: 1, computedAt: -1 });
MarketIndexSchema.index(
  { symbol: 1, timeframe: 1, indexType: 1, computedAt: 1 },
  { unique: true },
);
