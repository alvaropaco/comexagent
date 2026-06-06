import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CoffeeMarketSnapshotDocument =
  HydratedDocument<CoffeeMarketSnapshot>;

@Schema({ collection: 'coffee_market_snapshots', timestamps: true })
export class CoffeeMarketSnapshot {
  @Prop({ required: true, index: true })
  sourceUrl: string;

  @Prop({ required: true, index: true })
  fetchedAt: Date;

  @Prop({ required: true })
  extractedText: string;

  @Prop({ required: false })
  rawHtml?: string;

  @Prop({ required: true })
  memoText: string;
}

export const CoffeeMarketSnapshotSchema =
  SchemaFactory.createForClass(CoffeeMarketSnapshot);
