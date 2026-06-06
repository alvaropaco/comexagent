import { Injectable, Logger } from '@nestjs/common';
import { VectorService } from '../modules/vector/vector.service';
import { NormalizeService } from './normalize.service';
import { WebScrapeService } from './web-scrape.service';
import { WebSearchService } from './web-search.service';

function needsExternal(query: string) {
  return /\b(today|latest|current|now|recent|this\s+week)\b/i.test(query);
}

function extractYears(query: string): number[] {
  const years = new Set<number>();
  const m = query.match(/\b(20\d{2})\b/g);
  if (m) {
    for (const y of m) years.add(Number(y));
  }
  return Array.from(years).filter((y) => y >= 2000 && y <= 2100);
}

function looksLikeBrazilCoffeeExports(query: string) {
  const q = query.toLowerCase();
  return (
    /\bbrazil\b|\bbra\b/.test(q) &&
    /\bcoffee\b|\bcafe\b|\b0901\b/.test(q) &&
    /\bexport\b|\bexports\b/.test(q)
  );
}

@Injectable()
export class ExternalDataService {
  private readonly logger = new Logger(ExternalDataService.name);

  constructor(
    private readonly webSearch: WebSearchService,
    private readonly webScrape: WebScrapeService,
    private readonly normalize: NormalizeService,
    private readonly vector: VectorService,
  ) {}

  async ingestFromQuery(
    query: string,
    opts?: { force?: boolean; maxResults?: number; perQueryLimit?: number },
  ) {
    const q = (query ?? '').trim();
    if (!q) return { ok: false, reason: 'empty' };

    if (!opts?.force && !needsExternal(q)) {
      return { ok: true, skipped: true, reason: 'not_needed' };
    }

    const started = Date.now();

    const attempted: string[] = [];
    let stored = 0;

    if (opts?.force && looksLikeBrazilCoffeeExports(q)) {
      const years = extractYears(q);
      const targetYears = years.length ? years.slice(0, 3) : [2022, 2023];
      const products = ['0901', '090111', '090121'];
      const directUrls: string[] = [];
      for (const y of targetYears) {
        for (const p of products) {
          directUrls.push(
            `https://wits.worldbank.org/trade/comtrade/en/country/BRA/year/${y}/tradeflow/Exports/partner/ALL/product/${p}`,
          );
        }
      }

      for (const u of directUrls.slice(0, 6)) {
        attempted.push(u);
        const page = await this.webScrape.scrape(u);
        if (!page) continue;
        const doc = this.normalize.normalize(page.content, page.sourceUrl);
        if (!doc) continue;
        if (await this.vector.existsByMetadataHash(doc.hash)) continue;
        await this.vector.store({ text: doc.content, metadata: doc.metadata });
        stored += 1;
      }
    }

    const urls = await this.webSearch.search(q, opts?.maxResults ?? 5);
    if (!urls.length) {
      this.logger.log(
        JSON.stringify({
          tool: 'external_ingest',
          ok: true,
          ms: Date.now() - started,
          stored: 0,
        }),
      );
      return { ok: true, stored: 0 };
    }

    for (const u of urls.slice(0, opts?.perQueryLimit ?? 2)) {
      attempted.push(u.url);
      const page = await this.webScrape.scrape(u.url);
      if (!page) continue;
      const doc = this.normalize.normalize(page.content, page.sourceUrl);
      if (!doc) continue;
      if (await this.vector.existsByMetadataHash(doc.hash)) continue;
      await this.vector.store({ text: doc.content, metadata: doc.metadata });
      stored += 1;
    }

    this.logger.log(
      JSON.stringify({
        tool: 'external_ingest',
        ok: true,
        ms: Date.now() - started,
        stored,
        attempted,
      }),
    );

    return { ok: true, stored, attempted };
  }
}
