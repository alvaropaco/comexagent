import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { VectorModule } from '../modules/vector/vector.module';
import { AllowlistService } from './allowlist.service';
import { DailySyncService } from './daily-sync.service';
import { ExternalDataController } from './external-data.controller';
import { ExternalDataService } from './external-data.service';
import { NormalizeService } from './normalize.service';
import { WebScrapeService } from './web-scrape.service';
import { WebSearchService } from './web-search.service';

@Module({
  imports: [VectorModule, ScheduleModule.forRoot()],
  controllers: [ExternalDataController],
  providers: [
    AllowlistService,
    WebSearchService,
    WebScrapeService,
    NormalizeService,
    ExternalDataService,
    DailySyncService,
  ],
  exports: [ExternalDataService],
})
export class ToolsModule {}
