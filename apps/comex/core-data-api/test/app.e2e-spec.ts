import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/http/exception.filter';
import { RequestLoggingInterceptor } from '../src/common/http/logging.interceptor';
import { requestIdMiddleware } from '../src/common/http/request-id.middleware';
import { ResponseEnvelopeInterceptor } from '../src/common/http/response.interceptor';
import { YahooMarketDataService } from '../src/modules/market/yahoo-market-data.service';
import { YahooSeriesService } from '../src/modules/market/yahoo-series.service';

class FakeYahooSeriesService {
  private nowByKey = new Map<string, number>();

  async getSeries(
    symbol: string,
    interval: string,
    range: string,
    ttlSeconds = 120,
    forceRefresh = false,
  ) {
    void range;
    void ttlSeconds;
    void forceRefresh;
    const s = (symbol || '').trim().toUpperCase() || 'KC=F';
    const key = `${s}:${interval}`;
    const stepMs = interval === '5m' ? 5 * 60_000 : interval === '1h' ? 60 * 60_000 : 60_000;
    const base = this.nowByKey.get(key) ?? Date.UTC(2026, 0, 1, 0, 0, 0);
    const next = base + stepMs;
    this.nowByKey.set(key, next);

    const start = next - stepMs * 19;
    const series = Array.from({ length: 20 }).map((_, i) => ({
      timestamp: new Date(start + stepMs * i).toISOString(),
      price: 200 + i + (interval === '5m' ? 5 : interval === '1h' ? 10 : 0),
    }));

    return {
      symbol: s,
      interval,
      range: interval === '1h' ? '5d' : '1d',
      currency: 'USD',
      fetchedAt: new Date(next).toISOString(),
      series,
    };
  }
}

class FakeYahooMarketDataService {
  async getQuote(symbol: string) {
    const s = (symbol || '').trim().toUpperCase() || 'KC=F';
    return {
      symbol: s,
      price: 250,
      changePercent: 0.25,
      high: 260,
      low: 240,
      volume: 1234,
      currency: 'USD',
      timestamp: null,
    };
  }
}

describe('Core Data API (e2e)', () => {
  let app: INestApplication;
  let replset: MongoMemoryReplSet;

  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replset.getUri();
    process.env.PUBSUB_ENABLED = 'false';
    process.env.OUTBOX_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(YahooSeriesService)
      .useValue(new FakeYahooSeriesService())
      .overrideProvider(YahooMarketDataService)
      .useValue(new FakeYahooMarketDataService())
      .compile();

    app = moduleRef.createNestApplication();

    app.use(requestIdMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(
      new RequestLoggingInterceptor(),
      new ResponseEnvelopeInterceptor(),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await replset.stop();
  });

  it('creates and lists sales', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/sales')
      .send({
        commodity: 'coffee',
        incoterm: 'FOB',
        price: 3800,
        currency: 'USD',
        volume: '2 containers',
        origin: 'Santos',
        destination: 'Jordan',
      })
      .expect(201);

    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.commodity).toBe('coffee');

    const listRes = await request(app.getHttpServer())
      .get('/sales')
      .expect(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBe(1);
  });

  it('creates buy orders and explains matches', async () => {
    const saleRes = await request(app.getHttpServer())
      .post('/sales')
      .send({
        commodity: 'coffee',
        incoterm: 'FOB',
        price: 3800,
        currency: 'USD',
        volume: '2 containers',
        origin: 'Santos',
        destination: 'Jordan',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/buy-orders')
      .send({
        commodity: 'coffee',
        destination: 'Jordan',
        targetPrice: 4000,
        currency: 'USD',
        volume: '2 containers',
      })
      .expect(201);

    const explainRes = await request(app.getHttpServer())
      .get('/matches/explain')
      .query({ saleId: saleRes.body.data._id, limit: 5 })
      .expect(200);

    expect(explainRes.body.success).toBe(true);
    expect(explainRes.body.data.length).toBeGreaterThan(0);
  });

  it('ingests market ticks and computes derived indexes', async () => {
    for (let i = 0; i < 12; i++) {
      const ingestRes = await request(app.getHttpServer())
        .post('/market/ticks/ingest')
        .send({ symbol: 'KC=F', timeframes: ['1m'] })
        .expect(201);
      expect(ingestRes.body.success).toBe(true);
      expect(ingestRes.body.data.symbol).toBe('KC=F');
    }

    const tapeRes = await request(app.getHttpServer())
      .get('/market/ticks/ticker-tape')
      .query({ timeframe: '1m', limit: 5 })
      .expect(200);
    expect(tapeRes.body.success).toBe(true);
    expect(tapeRes.body.data.ticks.length).toBeGreaterThan(0);

    const computeRes = await request(app.getHttpServer())
      .post('/market/indexes/compute')
      .send({ symbol: 'KC=F', timeframes: ['1m'], lookback: 50 })
      .expect(201);
    expect(computeRes.body.success).toBe(true);
    expect(computeRes.body.data.results[0].inserted).toBeGreaterThan(0);

    const computeRes2 = await request(app.getHttpServer())
      .post('/market/indexes/compute')
      .send({ symbol: 'KC=F', timeframes: ['1m'], lookback: 50 })
      .expect(201);
    expect(computeRes2.body.success).toBe(true);
    expect(computeRes2.body.data.results[0].inserted).toBe(0);

    const idxRes = await request(app.getHttpServer())
      .get('/market/indexes')
      .query({ symbol: 'KC=F', timeframe: '1m', limit: 20 })
      .expect(200);
    expect(idxRes.body.success).toBe(true);
    expect(idxRes.body.data.indexes.length).toBeGreaterThanOrEqual(3);
  });
});
