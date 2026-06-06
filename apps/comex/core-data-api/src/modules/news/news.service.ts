import { Injectable } from '@nestjs/common';
import Parser from 'rss-parser';

type NewsItem = {
  creator?: string;
  title?: string;
  link?: string;
  pubDate?: number;
  author?: string;
  enclosure?: any;
  isoDate?: string;
  score: number;
};

@Injectable()
export class NewsService {
  private readonly parser = new Parser();

  async getNews(): Promise<NewsItem[]> {
    const feed = await this.parser.parseURL(
      'https://www.investing.com/rss/news_11.rss',
    );

    const priorityKeywords = ['coffee', 'pepper'];
    const generalKeywords = ['commodity', 'trade', 'market', 'sugar', 'cocoa'];

    const items = (feed.items || []).map((item: any) => {
      const content = (
        (item.title || '') +
        ' ' +
        (item.contentSnippet || '')
      ).toLowerCase();
      let score = 0;
      if (priorityKeywords.some((kw) => content.includes(kw))) score += 100;
      if (generalKeywords.some((kw) => content.includes(kw))) score += 10;

      const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;

      return {
        creator: item.creator,
        title: item.title,
        link: item.link,
        pubDate,
        author: item.author,
        enclosure: item.enclosure,
        isoDate: item.isoDate,
        score,
      };
    });

    const sortedItems = items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.pubDate || 0) - (a.pubDate || 0);
    });

    return sortedItems.slice(0, 12);
  }
}
