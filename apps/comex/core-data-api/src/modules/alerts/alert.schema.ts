import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AlertDocument = HydratedDocument<Alert>;

@Schema({
  collection: 'alerts',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class Alert {
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true, index: true })
  userId: string;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
AlertSchema.index({ userId: 1, createdAt: -1 });
