import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSaleDto {
  @IsString()
  commodity: string;

  @IsString()
  incoterm: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  currency: string;

  @IsString()
  volume: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;
}
