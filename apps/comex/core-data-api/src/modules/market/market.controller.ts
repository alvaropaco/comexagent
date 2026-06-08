import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketIngestionService } from './market-ingestion.service';
import { MarketIndexingService } from './market-indexing.service';
import { MarketRehydrationService } from './market-rehydration.service';
import { MarketService } from './market.service';
import { MarketTemporalQueryService } from './market-temporal-query.service';
import { MarketTimeframe } from './market-tick.schema';

function parseTimeframes(input: unknown): MarketTimeframe[] {
  const allowed: MarketTimeframe[] = ['1m', '5m', '1h'];
  const raw = Array.isArray(input) ? input : null;
  const out: MarketTimeframe[] = [];
  if (!raw) return allowed;
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const s = v.trim() as MarketTimeframe;
    if (allowed.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.length ? out : allowed;
}

@Controller('market')
export class MarketController {
  private readonly token?: string;

  constructor(
    private readonly market: MarketService,
    private readonly rehydration: MarketRehydrationService,
    private readonly ingestion: MarketIngestionService,
    private readonly indexing: MarketIndexingService,
    private readonly temporalQuery: MarketTemporalQueryService,
    private readonly config: ConfigService,
  ) {
    this.token = this.config.get<string>('MARKET_SYNC_TOKEN');
  }

  /**
   * Require a valid sync token on every mutating endpoint, in all environments.
   * Fails closed: if MARKET_SYNC_TOKEN is unset the endpoint is unavailable
   * rather than silently open.
   */
  private assertAuthorized(token: string | undefined): void {
    if (!this.token) {
      throw new HttpException(
        'MARKET_SYNC_TOKEN not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const provided = (token ?? '').trim();
    const expected = this.token.trim();
    if (!provided || provided !== expected) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('rehydrate')
  async rehydrate(
    @Headers('x-market-sync-token') token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    void body;
    this.assertAuthorized(token);

    const results = await this.rehydration.rehydrateAll();
    const okCount = results.filter((r) => r.ok).length;
    const vectorCount = results.filter((r) => r.storedVector).length;
    const snapshotCount = results.filter((r) => r.storedSnapshot).length;
    return {
      ok: true,
      summary: {
        sources: results.length,
        okCount,
        storedVector: vectorCount,
        storedSnapshot: snapshotCount,
      },
      results,
    };
  }

  @Post('coffee/sync')
  async syncCoffee(
    @Headers('x-market-sync-token') token: string | undefined,
    @Body() body: { sourceUrl?: string },
  ) {
    this.assertAuthorized(token);

    const sourceUrl = body.sourceUrl ?? 'https://comexlive.org/coffee/';
    const created = await this.market.syncCoffeeFromUrl(sourceUrl);
    return {
      ok: true,
      created: {
        _id: created._id,
        sourceUrl: created.sourceUrl,
        fetchedAt: created.fetchedAt,
        memoText: created.memoText,
      },
    };
  }

  @Post('ticks/ingest')
  async ingestTicks(
    @Headers('x-market-sync-token') token: string | undefined,
    @Body() body: { symbol?: string; commodity?: string; timeframes?: unknown },
  ) {
    this.assertAuthorized(token);

    const symbol = (body.symbol ?? 'KC=F').trim() || 'KC=F';
    const timeframes = parseTimeframes(body.timeframes);
    const results = await this.ingestion.ingestLatestForSymbol({
      symbol,
      commodity: body.commodity,
      timeframes,
    });

    return {
      ok: true,
      symbol,
      timeframes,
      results,
    };
  }

  @Post('indexes/compute')
  async computeIndexes(
    @Headers('x-market-sync-token') token: string | undefined,
    @Body() body: { symbol?: string; timeframes?: unknown; lookback?: number },
  ) {
    this.assertAuthorized(token);

    const symbol = (body.symbol ?? 'KC=F').trim() || 'KC=F';
    const timeframes = parseTimeframes(body.timeframes);
    const results: Array<{
      timeframe: MarketTimeframe;
      inserted: number;
      computedAt: string | null;
      reason?: string;
    }> = [];
    for (const tf of timeframes) {
      const r = await this.indexing.computeAndStoreLatest({
        symbol,
        timeframe: tf,
        lookback: body.lookback,
      });
      results.push({
        timeframe: tf,
        inserted: r.inserted,
        computedAt: r.computedAt ? r.computedAt.toISOString() : null,
        reason: r.reason,
      });
    }

    return { ok: true, symbol, timeframes, results };
  }

  @Get('coffee/latest')
  async latestCoffee() {
    const latest = await this.market.latestCoffee();
    return { ok: true, latest };
  }

  @Get('ticks/ticker-tape')
  async tickerTape(
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.temporalQuery.tickerTape({ timeframe, limit });
    return { ok: true, ...data };
  }

  @Get('ticks/chart')
  async marketChart(
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.temporalQuery.marketChart({
      symbol,
      timeframe,
      limit,
    });
    return { ok: true, ...data };
  }

  @Get('indexes')
  async marketIndexes(
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.temporalQuery.marketIndexes({
      symbol,
      timeframe,
      limit,
    });
    return { ok: true, ...data };
  }
}
