import { IsString } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  type: string;

  @IsString()
  message: string;

  @IsString()
  userId: string;
}
