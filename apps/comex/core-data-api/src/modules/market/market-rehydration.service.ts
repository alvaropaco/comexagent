import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { VectorService } from '../vector/vector.service';
import {
  MarketSnapshot,
  MarketSnapshotDocument,
} from './market-snapshot.schema';
import { YahooMarketDataService } from './yahoo-market-data.service';
import { YahooMarketNormalizerService } from './yahoo-market-normalizer.service';

type HtmlSource = {
  id: string;
  kind: 'html';
  url: string;
  market?: string;
  commodity?: string;
  topic?: string;
  selectors?: string[];
};

type YahooSource = {
  id: string;
  kind: 'yahoo_quote';
  symbol: string;
  market?: string;
  commodity?: string;
  topic?: string;
};

export type MarketRehydrateSource = HtmlSource | YahooSource;

export type MarketRehydrateResult = {
  id: string;
  ok: boolean;
  kind: MarketRehydrateSource['kind'];
  storedSnapshot: boolean;
  storedVector: boolean;
  reason?: string;
};

function safeJsonParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function compactWhitespace(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function stripHtmlToText(html: string): string {
  const $ = cheerio.load(html ?? '');
  $('script,style,noscript,svg').remove();
  return compactWhitespace($.root().text());
}

function extractFromSelectors(
  html: string,
  selectors: string[] | undefined,
): string {
  if (!selectors || selectors.length === 0) return stripHtmlToText(html);
  const $ = cheerio.load(html ?? '');
  $('script,style,noscript,svg').remove();
  for (const sel of selectors) {
    const picked = compactWhitespace($(sel).text());
    if (picked) return picked;
  }
  return compactWhitespace($.root().text());
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function buildMemoText(p: {
  title: string;
  id: string;
  kind: string;
  sourceUrl?: string;
  fetchedAt: Date;
  market?: string;
  commodity?: string;
  topic?: string;
  symbol?: string;
  extractedText: string;
}): string {
  const snippet = (p.extractedText ?? '').slice(0, 2400);
  return [
    p.title,
    `id=${p.id}`,
    `kind=${p.kind}`,
    p.sourceUrl ? `source=${p.sourceUrl}` : null,
    p.symbol ? `symbol=${p.symbol}` : null,
    p.market ? `market=${p.market}` : null,
    p.commodity ? `commodity=${p.commodity}` : null,
    p.topic ? `topic=${p.topic}` : null,
    `fetchedAt=${p.fetchedAt.toISOString()}`,
    '',
    snippet,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join('\n');
}

function defaultSources(): MarketRehydrateSource[] {
  return [
    {
      id: 'infomoney_altas_baixas',
      kind: 'html',
      url: 'https://www.infomoney.com.br/ferramentas/altas-e-baixas/',
      market: 'b3',
      topic: 'market_movers',
      selectors: ['main', 'body'],
    },
    {
      id: 'advfn_monitor',
      kind: 'html',
      url: 'https://br.advfn.com/monitor',
      market: 'multi',
      topic: 'quotes',
      selectors: ['table', 'main', 'body'],
    },
    {
      id: 'advfn_bmf_icfk26',
      kind: 'html',
      url: 'https://br.advfn.com/bolsa-de-valores/bmf/ICFK26/cotacao',
      market: 'bmf',
      commodity: 'coffee',
      topic: 'price',
      selectors: ['main', 'body'],
    },
    {
      id: 'yahoo_kc_f',
      kind: 'yahoo_quote',
      symbol: 'KC=F',
      market: 'ice',
      commodity: 'coffee',
      topic: 'price',
    },
  ];
}

@Injectable()
export class MarketRehydrationService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(MarketSnapshot.name)
    private readonly snapshotModel: Model<MarketSnapshotDocument>,
    private readonly vector: VectorService,
    private readonly yahoo: YahooMarketDataService,
    private readonly yahooNormalizer: YahooMarketNormalizerService,
  ) {}

  async rehydrateAll() {
    const sources = this.resolveSources();
    const results: MarketRehydrateResult[] = [];
    for (const source of sources) {
      results.push(await this.runSource(source));
    }
    return results;
  }

  private resolveSources(): MarketRehydrateSource[] {
    const raw = this.config.get<string>('MARKET_REHYDRATE_SOURCES_JSON');
    const parsed = safeJsonParse<unknown>(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((s) => this.normalizeSource(s))
        .filter((s): s is MarketRehydrateSource => Boolean(s));
      if (normalized.length > 0) return normalized;
    }
    return defaultSources();
  }

  private normalizeSource(s: unknown): MarketRehydrateSource | null {
    if (!s || typeof s !== 'object') return null;
    const v = s as Record<string, unknown>;
    const kind = typeof v.kind === 'string' ? v.kind : '';
    const id = typeof v.id === 'string' ? v.id : '';
    const market = typeof v.market === 'string' ? v.market : undefined;
    const commodity = typeof v.commodity === 'string' ? v.commodity : undefined;
    const topic = typeof v.topic === 'string' ? v.topic : undefined;
    if (!id) return null;

    if (kind === 'yahoo_quote') {
      const symbol = typeof v.symbol === 'string' ? v.symbol : '';
      if (!symbol) return null;
      return { id, kind: 'yahoo_quote', symbol, market, commodity, topic };
    }

    const url = typeof v.url === 'string' ? v.url : '';
    if (!url) return null;
    const selectors = Array.isArray(v.selectors)
      ? v.selectors.filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
      : undefined;
    return { id, kind: 'html', url, market, commodity, topic, selectors };
  }

  private async runSource(
    source: MarketRehydrateSource,
  ): Promise<MarketRehydrateResult> {
    if (source.kind === 'yahoo_quote') {
      return this.runYahooQuote(source);
    }
    return this.runHtmlSource(source);
  }

  private async runYahooQuote(
    source: YahooSource,
  ): Promise<MarketRehydrateResult> {
    const fetchedAt = new Date();
    try {
      const quote = await this.yahoo.getQuote(source.symbol);
      const normalized = this.yahooNormalizer.normalize(quote);
      const extractedText = compactWhitespace(JSON.stringify(normalized));
      const memoText = buildMemoText({
        title: 'Market snapshot',
        id: source.id,
        kind: source.kind,
        fetchedAt,
        market: source.market,
        commodity: source.commodity ?? normalized.commodity ?? undefined,
        topic: source.topic,
        symbol: normalized.symbol,
        extractedText,
      });
      const contentHash = sha256(memoText);

      const storedSnapshot = await this.storeSnapshot({
        sourceId: source.id,
        kind: source.kind,
        fetchedAt,
        market: source.market,
        commodity: source.commodity ?? normalized.commodity ?? undefined,
        topic: source.topic,
        symbol: normalized.symbol,
        extractedText,
        memoText,
        contentHash,
      });

      const storedVector = await this.storeVector(memoText, {
        type: 'market_data',
        market: source.market ?? 'yahoo',
        commodity: source.commodity ?? normalized.commodity ?? undefined,
        topic: source.topic ?? 'price',
        source: 'yahoo_finance',
        symbol: normalized.symbol,
        fetchedAt: fetchedAt.toISOString(),
        date: fetchedAt.toISOString(),
        contentHash,
      });

      return {
        id: source.id,
        ok: true,
        kind: source.kind,
        storedSnapshot,
        storedVector,
      };
    } catch (e) {
      return {
        id: source.id,
        ok: false,
        kind: source.kind,
        storedSnapshot: false,
        storedVector: false,
        reason: String(e),
      };
    }
  }

  private async runHtmlSource(
    source: HtmlSource,
  ): Promise<MarketRehydrateResult> {
    const fetchedAt = new Date();
    try {
      const resp = await fetch(source.url, {
        headers: {
          'user-agent': 'comex-core-data-api/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!resp.ok) {
        return {
          id: source.id,
          ok: false,
          kind: source.kind,
          storedSnapshot: false,
          storedVector: false,
          reason: `http_${resp.status}`,
        };
      }

      const html = await resp.text();
      const extractedText = extractFromSelectors(html, source.selectors);
      const memoText = buildMemoText({
        title: 'Market snapshot',
        id: source.id,
        kind: source.kind,
        sourceUrl: source.url,
        fetchedAt,
        market: source.market,
        commodity: source.commodity,
        topic: source.topic,
        extractedText,
      });
      const contentHash = sha256(memoText);

      const storedSnapshot = await this.storeSnapshot({
        sourceId: source.id,
        kind: source.kind,
        sourceUrl: source.url,
        fetchedAt,
        market: source.market,
        commodity: source.commodity,
        topic: source.topic,
        extractedText,
        rawHtml: html.slice(0, 200_000),
        memoText,
        contentHash,
      });

      const storedVector = await this.storeVector(memoText, {
        type: 'market_data',
        market: source.market,
        commodity: source.commodity,
        topic: source.topic,
        sourceUrl: source.url,
        fetchedAt: fetchedAt.toISOString(),
        date: fetchedAt.toISOString(),
        contentHash,
      });

      return {
        id: source.id,
        ok: true,
        kind: source.kind,
        storedSnapshot,
        storedVector,
      };
    } catch (e) {
      return {
        id: source.id,
        ok: false,
        kind: source.kind,
        storedSnapshot: false,
        storedVector: false,
        reason: String(e),
      };
    }
  }

  private async storeSnapshot(p: {
    sourceId: string;
    kind: string;
    sourceUrl?: string;
    market?: string;
    commodity?: string;
    topic?: string;
    symbol?: string;
    fetchedAt: Date;
    extractedText: string;
    rawHtml?: string;
    memoText: string;
    contentHash: string;
  }): Promise<boolean> {
    try {
      await this.snapshotModel.create({
        sourceId: p.sourceId,
        kind: p.kind,
        sourceUrl: p.sourceUrl,
        market: p.market,
        commodity: p.commodity,
        topic: p.topic,
        symbol: p.symbol,
        fetchedAt: p.fetchedAt,
        extractedText: p.extractedText,
        rawHtml: p.rawHtml,
        memoText: p.memoText,
        contentHash: p.contentHash,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async storeVector(
    text: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.vector.store({ text, metadata });
      return true;
    } catch {
      return false;
    }
  }
}
