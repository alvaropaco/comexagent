import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BuyOrderDocument = HydratedDocument<BuyOrder>;

@Schema({
  collection: 'buy_orders',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class BuyOrder {
  @Prop({ required: true, index: true })
  commodity: string;

  @Prop({ index: true })
  destination?: string;

  @Prop({ required: true })
  targetPrice: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  volume: string;

  @Prop({ unique: true, sparse: true, index: true })
  idempotencyKey?: string;
}

export const BuyOrderSchema = SchemaFactory.createForClass(BuyOrder);
BuyOrderSchema.index({ commodity: 1, createdAt: -1 });
