import { Controller, Get, Query } from '@nestjs/common';
import { YahooChartService } from './yahoo-chart.service';
import { YahooMarketDataService } from './yahoo-market-data.service';
import { YahooMarketNormalizerService } from './yahoo-market-normalizer.service';
import { YahooMoversService } from './yahoo-movers.service';
import { YahooSeriesService } from './yahoo-series.service';

@Controller('market')
export class YahooMarketController {
  constructor(
    private readonly chart: YahooChartService,
    private readonly market: YahooMarketDataService,
    private readonly normalizer: YahooMarketNormalizerService,
    private readonly movers: YahooMoversService,
    private readonly series: YahooSeriesService,
  ) {}

  @Get('yahoo/quote')
  async quote(@Query('symbol') symbol?: string) {
    try {
      const raw = await this.market.getQuote(symbol ?? 'KC=F');
      const normalized = this.normalizer.normalize(raw);
      return { ok: true, data: normalized };
    } catch (e) {
      return { ok: false, reason: 'quote_failed', error: String(e) };
    }
  }

  @Get('yahoo/chart/coffee/level4')
  async coffeeLevel4() {
    try {
      const data = await this.chart.getCoffeeLevel4();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, reason: 'chart_failed', error: String(e) };
    }
  }

  @Get('yahoo/movers/commodities')
  async commodityMovers() {
    try {
      const data = await this.movers.getCommodityMovers();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, reason: 'movers_failed', error: String(e) };
    }
  }

  @Get('yahoo/chart/series')
  async chartSeries(
    @Query('symbol') symbol?: string,
    @Query('interval') interval?: string,
    @Query('range') range?: string,
  ) {
    try {
      const data = await this.series.getSeries(
        symbol ?? 'KC=F',
        interval ?? '1d',
        range ?? '1y',
      );
      return { ok: true, data };
    } catch (e) {
      return { ok: false, reason: 'series_failed', error: String(e) };
    }
  }
}
