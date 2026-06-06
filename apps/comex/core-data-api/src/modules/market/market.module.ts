import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VectorModule } from '../vector/vector.module';
import {
  CoffeeMarketSnapshot,
  CoffeeMarketSnapshotSchema,
} from './coffee-market.schema';
import { MarketIndex, MarketIndexSchema } from './market-index.schema';
import { MarketRehydrationService } from './market-rehydration.service';
import { MarketSnapshot, MarketSnapshotSchema } from './market-snapshot.schema';
import { MarketTick, MarketTickSchema } from './market-tick.schema';
import { MarketController } from './market.controller';
import { MarketIngestionService } from './market-ingestion.service';
import { MarketIndexingService } from './market-indexing.service';
import { MarketService } from './market.service';
import { MarketTemporalJob } from './market-temporal.job';
import { MarketTemporalQueryService } from './market-temporal-query.service';
import { YahooChartService } from './yahoo-chart.service';
import { YahooMarketController } from './yahoo-market.controller';
import { YahooMarketDataService } from './yahoo-market-data.service';
import { YahooMoversService } from './yahoo-movers.service';
import { YahooMarketNormalizerService } from './yahoo-market-normalizer.service';
import { YahooSeriesService } from './yahoo-series.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CoffeeMarketSnapshot.name,
        schema: CoffeeMarketSnapshotSchema,
      },
      {
        name: MarketSnapshot.name,
        schema: MarketSnapshotSchema,
      },
      {
        name: MarketTick.name,
        schema: MarketTickSchema,
      },
      {
        name: MarketIndex.name,
        schema: MarketIndexSchema,
      },
    ]),
    VectorModule,
  ],
  controllers: [MarketController, YahooMarketController],
  providers: [
    MarketService,
    MarketRehydrationService,
    MarketIngestionService,
    MarketIndexingService,
    MarketTemporalJob,
    MarketTemporalQueryService,
    YahooChartService,
    YahooMarketDataService,
    YahooMoversService,
    YahooMarketNormalizerService,
    YahooSeriesService,
  ],
  exports: [MarketService],
})
export class MarketModule {}
