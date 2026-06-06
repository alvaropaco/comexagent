import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AllowlistService } from './allowlist.service';
import { withRetries, withTimeout } from './http-utils';

export type WebSearchResult = { title: string; url: string; snippet?: string };

function unwrapDuckDuckGoUrl(href: string): string {
  const h = (href ?? '').trim();
  if (!h) return '';
  if (h.startsWith('http://') || h.startsWith('https://')) {
    try {
      const u = new URL(h);
      if (u.hostname.endsWith('duckduckgo.com')) {
        const uddg = u.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
      }
    } catch {
      return h;
    }
    return h;
  }

  try {
    const u = new URL(`https://duckduckgo.com${h}`);
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return u.toString();
  } catch {
    return h;
  }
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(private readonly allowlist: AllowlistService) {}

  async search(query: string, limit = 5): Promise<WebSearchResult[]> {
    const q = (query ?? '').trim();
    if (!q) return [];

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const started = Date.now();
    const html = await withRetries(
      () =>
        withTimeout(async (signal) => {
          const resp = await fetch(url, {
            signal,
            headers: {
              'user-agent': 'comex-core-data-api/1.0',
              accept: 'text/html',
            },
          });
          if (!resp.ok) throw new Error(`search_http_${resp.status}`);
          return await resp.text();
        }, 7000),
      1,
    );

    const $ = cheerio.load(html);
    const all: WebSearchResult[] = [];
    $('.result__a').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      if (!href) return;
      const target = unwrapDuckDuckGoUrl(href);
      if (!target) return;
      if (!this.allowlist.isAllowed(target)) return;

      const snippet = $(el)
        .closest('.result')
        .find('.result__snippet')
        .text()
        .trim();
      all.push({ title, url: target, snippet });
    });

    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
      .slice(0, 10);

    const scored = all
      .map((r) => {
        const hay = `${r.title} ${r.snippet ?? ''} ${r.url}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (hay.includes(t)) score += 1;
        }
        if (/(\b2020\b|\b2021\b|\b2022\b|\b2023\b|\b2024\b)/.test(hay))
          score += 2;
        if (/\bexport\b|\bexports\b|\bimport\b|\bimports\b|\btrade\b/.test(hay))
          score += 2;
        if (/\b0901\b|\bcoffee\b|\bcafe\b/.test(hay)) score += 2;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.r);

    const results = scored.slice(0, limit);

    this.logger.log(
      JSON.stringify({
        tool: 'web_search',
        ok: true,
        ms: Date.now() - started,
        count: results.length,
      }),
    );
    return results;
  }
}
