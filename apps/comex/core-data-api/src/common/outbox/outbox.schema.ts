import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

@Schema({
  collection: 'events_outbox',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class OutboxEvent {
  @Prop({ required: true })
  eventType: string;

  @Prop({ type: Object, required: true })
  event: Record<string, unknown>;

  @Prop({
    required: true,
    enum: ['PENDING', 'PUBLISHED', 'FAILED'],
    default: 'PENDING',
  })
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';

  @Prop()
  publishedAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
OutboxEventSchema.index({ status: 1, createdAt: 1 });
