import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export type NormalizedExternalDoc = {
  content: string;
  summary: string;
  metadata: Record<string, unknown>;
  hash: string;
};

function detectCommodity(text: string) {
  const t = text.toLowerCase();
  if (/\bcoffee\b|\bcafe\b/.test(t)) return 'coffee';
  if (/\bpepper\b|\bpimenta\b/.test(t)) return 'pepper';
  return null;
}

function detectTopic(text: string) {
  const t = text.toLowerCase();
  if (
    /\b(price|prices|quote|futures|last trade|high|low|open interest)\b/.test(t)
  )
    return 'price';
  if (
    /\b(logistics|shipping|freight|port|customs|documentation|incoterm|fob|cif|cfr)\b/.test(
      t,
    )
  )
    return 'logistics';
  if (/\b(forecast|outlook|projection|trend|trends)\b/.test(t))
    return 'forecast';
  if (/\b(weather|rain|drought|frost|el\s*nino|climate)\b/.test(t))
    return 'weather';
  return 'general';
}

function extractOrigin(text: string) {
  const m = text.match(/\bFOB\s+([A-Za-z][A-Za-z\s\-]{2,40})\b/i);
  if (m) return m[1].trim();
  const m2 = text.match(/\borigin\s*[:=]\s*([A-Za-z][A-Za-z\s\-]{2,40})\b/i);
  if (m2) return m2[1].trim();
  return null;
}

@Injectable()
export class NormalizeService {
  normalize(raw: string, sourceUrl: string): NormalizedExternalDoc | null {
    const content = (raw ?? '').trim();
    if (!content) return null;
    const summary = content.slice(0, 240);
    const commodity = detectCommodity(content);
    const topic = detectTopic(content);
    const origin = extractOrigin(content);
    const date = new Date().toISOString();
    const hash = createHash('sha1').update(summary).digest('hex');

    const isMarket = commodity && topic === 'price';
    const type = isMarket ? 'market_data' : 'external_web';

    return {
      content,
      summary,
      hash,
      metadata: {
        type,
        commodity,
        topic,
        origin,
        date,
        sourceUrl,
        sourceType: 'web',
        hash,
        ...(isMarket ? { market: commodity, fetchedAt: date } : {}),
      },
    };
  }
}
