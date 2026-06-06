import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VectorDocDocument = HydratedDocument<VectorDoc>;

@Schema({
  collection: 'memory_embeddings',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class VectorDoc {
  @Prop({ required: true })
  text: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop({ type: Object, required: true })
  metadata: Record<string, unknown>;

  @Prop({ required: true })
  embeddingModel: string;
}

export const VectorDocSchema = SchemaFactory.createForClass(VectorDoc);
VectorDocSchema.index({ 'metadata.type': 1, createdAt: -1 });
VectorDocSchema.index({ 'metadata.hash': 1, createdAt: -1 });
