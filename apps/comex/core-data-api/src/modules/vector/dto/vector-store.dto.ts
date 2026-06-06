import { IsObject, IsString, MaxLength } from 'class-validator';

export class VectorStoreDto {
  @IsString()
  @MaxLength(20000)
  text: string;

  @IsObject()
  metadata: Record<string, unknown>;
}
