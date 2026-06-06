import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CreateBuyOrderDto } from './dto/create-buy-order.dto';
import { BuyersService } from './buyers.service';

@Controller('buy-orders')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateBuyOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.buyers.create(dto, idempotencyKey);
  }

  @Get()
  list(@Query('commodity') commodity?: string) {
    if (commodity) {
      return this.buyers.findByCommodity(commodity);
    }
    return this.buyers.findAll();
  }
}
