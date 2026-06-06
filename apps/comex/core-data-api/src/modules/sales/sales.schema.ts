import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SaleDocument = HydratedDocument<Sale>;

@Schema({
  collection: 'sales',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class Sale {
  @Prop({ required: true, index: true })
  commodity: string;

  @Prop()
  origin?: string;

  @Prop({ index: true })
  destination?: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true })
  incoterm: string;

  @Prop({ required: true })
  volume: string;

  @Prop({ unique: true, sparse: true, index: true })
  idempotencyKey?: string;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);
SaleSchema.index({ commodity: 1, createdAt: -1 });
