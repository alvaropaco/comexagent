import type { MarketSignalLine } from "../types/comex";

export function parseMarketSignal(text: string): MarketSignalLine | null {
  const lines = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const out: MarketSignalLine = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("signal:")) out.signal = line.split(":").slice(1).join(":").trim().toLowerCase();
    if (lower.startsWith("confidence:")) out.confidence = line.split(":").slice(1).join(":").trim().toLowerCase();
    if (lower.startsWith("score:")) {
      const n = Number(line.split(":").slice(1).join(":").trim().replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(n)) out.score = n;
    }
    if (lower.startsWith("timeframe alignment:")) {
      const m1 = line.match(/1m\s*=\s*([a-z_]+)/i);
      const m5 = line.match(/5m\s*=\s*([a-z_]+)/i);
      const mH = line.match(/1h\s*=\s*([a-z_]+)/i);
      if (m1) out.alignment1m = m1[1].toLowerCase();
      if (m5) out.alignment5m = m5[1].toLowerCase();
      if (mH) out.alignment1h = mH[1].toLowerCase();
    }
    if (lower.startsWith("volume:")) out.volume = line.split(":").slice(1).join(":").trim().toLowerCase();
    if (lower.startsWith("reason:")) out.reason = line.split(":").slice(1).join(":").trim();
    if (lower.startsWith("risks:")) out.risks = line.split(":").slice(1).join(":").trim();
  }

  if (!out.signal || !out.confidence) return null;
  return out;
}

export function isMarketMoversText(text: string): boolean {
  return (text || "").toLowerCase().includes("top movers (commodities)");
}

