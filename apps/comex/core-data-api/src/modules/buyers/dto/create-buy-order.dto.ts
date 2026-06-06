import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBuyOrderDto {
  @IsString()
  commodity: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsNumber()
  @Min(0)
  targetPrice: number;

  @IsString()
  currency: string;

  @IsString()
  volume: string;
}
