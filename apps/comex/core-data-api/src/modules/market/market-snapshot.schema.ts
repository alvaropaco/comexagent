import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketSnapshotDocument = HydratedDocument<MarketSnapshot>;

@Schema({ collection: 'market_snapshots', timestamps: true })
export class MarketSnapshot {
  @Prop({ required: true, index: true })
  sourceId: string;

  @Prop({ required: true })
  kind: string;

  @Prop({ required: false })
  sourceUrl?: string;

  @Prop({ required: false, index: true })
  market?: string;

  @Prop({ required: false, index: true })
  commodity?: string;

  @Prop({ required: false, index: true })
  topic?: string;

  @Prop({ required: false, index: true })
  symbol?: string;

  @Prop({ required: true, index: true })
  fetchedAt: Date;

  @Prop({ required: true })
  extractedText: string;

  @Prop({ required: false })
  rawHtml?: string;

  @Prop({ required: true })
  memoText: string;

  @Prop({ required: true, index: true })
  contentHash: string;
}

export const MarketSnapshotSchema =
  SchemaFactory.createForClass(MarketSnapshot);

MarketSnapshotSchema.index({ sourceId: 1, contentHash: 1 }, { unique: true });
