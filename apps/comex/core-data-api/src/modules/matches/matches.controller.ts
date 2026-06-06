import { Controller, Get, Query } from '@nestjs/common';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  list(@Query('saleId') saleId: string) {
    return this.matches.listForSale(saleId);
  }

  @Get('explain')
  explain(@Query('saleId') saleId: string, @Query('limit') limit?: string) {
    return this.matches.explainTopMatchesForSale(saleId, Number(limit ?? '5'));
  }
}
