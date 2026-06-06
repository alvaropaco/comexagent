import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketTickDocument = HydratedDocument<MarketTick>;

export type MarketTimeframe = '1m' | '5m' | '1h';

const MARKET_TIMEFRAMES: MarketTimeframe[] = ['1m', '5m', '1h'];

@Schema({ collection: 'market_ticks', timestamps: true })
export class MarketTick {
  @Prop({ required: false, index: true })
  commodity?: string;

  @Prop({ required: true, index: true })
  symbol: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: false })
  high?: number;

  @Prop({ required: false })
  low?: number;

  @Prop({ required: false })
  volume?: number;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true, index: true, type: String, enum: MARKET_TIMEFRAMES })
  timeframe: MarketTimeframe;

  @Prop({ required: true, index: true })
  timestamp: Date;

  @Prop({ required: true })
  ingestedAt: Date;
}

export const MarketTickSchema = SchemaFactory.createForClass(MarketTick);

MarketTickSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 });
MarketTickSchema.index({ timestamp: -1 });
MarketTickSchema.index({ symbol: 1, timeframe: 1, timestamp: 1 }, { unique: true });
