import { Injectable, Logger } from '@nestjs/common';
import { AllowlistService } from './allowlist.service';
import { withRetries, withTimeout } from './http-utils';

function stripHtmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return noScript
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class WebScrapeService {
  private readonly logger = new Logger(WebScrapeService.name);

  constructor(private readonly allowlist: AllowlistService) {}

  async scrape(url: string) {
    if (!this.allowlist.isAllowed(url)) return null;
    const started = Date.now();

    const html = await withRetries(
      () =>
        withTimeout(async (signal) => {
          const resp = await fetch(url, {
            signal,
            headers: {
              'user-agent': 'comex-core-data-api/1.0',
              accept: 'text/html,application/xhtml+xml',
            },
          });
          if (!resp.ok) throw new Error(`scrape_http_${resp.status}`);
          return await resp.text();
        }, 10000),
      1,
    );

    const text = stripHtmlToText(html).slice(0, 6000);
    this.logger.log(
      JSON.stringify({
        tool: 'web_scrape',
        ok: true,
        ms: Date.now() - started,
      }),
    );
    if (!text) return null;
    return { content: text, sourceUrl: url };
  }
}
