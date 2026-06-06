import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MatchDocument = HydratedDocument<Match>;

@Schema({
  collection: 'matches',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
})
export class Match {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  saleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  buyOrderId: Types.ObjectId;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true, default: 'ACTIVE' })
  status: string;
}

export const MatchSchema = SchemaFactory.createForClass(Match);
MatchSchema.index({ saleId: 1, buyOrderId: 1 }, { unique: true });
MatchSchema.index({ score: -1, createdAt: -1 });
