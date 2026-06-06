import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MarketIngestionService } from './market-ingestion.service';
import { MarketIndexingService } from './market-indexing.service';
import { MarketTimeframe } from './market-tick.schema';

@Injectable()
export class MarketTemporalJob {
  private readonly logger = new Logger(MarketTemporalJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ingestion: MarketIngestionService,
    private readonly indexing: MarketIndexingService,
  ) {}

  @Cron('*/2 * * * *')
  async run() {
    const enabled =
      (this.config.get<string>('MARKET_TEMPORAL_JOB_ENABLED') ?? '')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) return;

    const symbol = (this.config.get<string>('MARKET_TEMPORAL_SYMBOL') ?? 'KC=F')
      .trim()
      .toUpperCase();
    const timeframes: MarketTimeframe[] = ['1m', '5m', '1h'];
    const started = Date.now();

    try {
      const ingested = await this.ingestion.ingestLatestForSymbol({
        symbol,
        timeframes,
      });
      const indexed: any[] = [];
      for (const tf of timeframes) {
        indexed.push(
          await this.indexing.computeAndStoreLatest({ symbol, timeframe: tf }),
        );
      }

      this.logger.log(
        JSON.stringify({
          tool: 'market_temporal_job',
          ok: true,
          ms: Date.now() - started,
          symbol,
          ingested,
          indexed: indexed.map((x) => ({
            inserted: x.inserted,
            computedAt: x.computedAt ? x.computedAt.toISOString() : null,
            reason: x.reason,
          })),
        }),
      );
    } catch (e) {
      this.logger.warn(
        JSON.stringify({
          tool: 'market_temporal_job',
          ok: false,
          ms: Date.now() - started,
          symbol,
          err: String(e),
        }),
      );
    }
  }
}

