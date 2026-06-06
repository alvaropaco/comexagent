import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VectorService } from '../vector/vector.service';
import {
  CoffeeMarketSnapshot,
  CoffeeMarketSnapshotDocument,
} from './coffee-market.schema';

function stripHtmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noScript
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function buildMemoText(
  sourceUrl: string,
  fetchedAt: Date,
  extractedText: string,
): string {
  const snippet = extractedText.slice(0, 1600);
  return [
    `Coffee market snapshot`,
    `source=${sourceUrl}`,
    `fetchedAt=${fetchedAt.toISOString()}`,
    '',
    snippet,
  ].join('\n');
}

@Injectable()
export class MarketService {
  constructor(
    @InjectModel(CoffeeMarketSnapshot.name)
    private readonly coffeeModel: Model<CoffeeMarketSnapshotDocument>,
    private readonly vector: VectorService,
  ) {}

  async syncCoffeeFromUrl(sourceUrl: string) {
    const resp = await fetch(sourceUrl, {
      headers: {
        'user-agent': 'comex-core-data-api/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch: ${resp.status}`);
    }

    const html = await resp.text();
    const extractedText = stripHtmlToText(html);
    const fetchedAt = new Date();
    const memoText = buildMemoText(sourceUrl, fetchedAt, extractedText);

    const created = await this.coffeeModel.create({
      sourceUrl,
      fetchedAt,
      extractedText,
      rawHtml: html.slice(0, 200_000),
      memoText,
    });

    try {
      await this.vector.store({
        text: memoText,
        metadata: {
          type: 'market_data',
          market: 'coffee',
          commodity: 'coffee',
          topic: 'price',
          sourceUrl,
          fetchedAt: fetchedAt.toISOString(),
          date: fetchedAt.toISOString(),
          snapshotId: String(created._id),
        },
      });
    } catch {}

    return created.toObject();
  }

  async latestCoffee() {
    return this.coffeeModel
      .findOne(
        {},
        {
          sourceUrl: 1,
          fetchedAt: 1,
          memoText: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        { sort: { fetchedAt: -1 } },
      )
      .lean();
  }
}
