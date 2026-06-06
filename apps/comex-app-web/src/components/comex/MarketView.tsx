import { useEffect, useMemo, useState } from 'react';
import { Clock, TrendingUp, ExternalLink, RefreshCw, Pause, Play, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BuyOrder, CommodityMovers, CoffeeLevel4, MarketCoffeeLatest, Sale } from '../../types/comex';
import { coreDataApi } from '../../lib/api';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';

type Direction = 'upward' | 'downward' | 'mixed';
type Acceleration = 'accelerating' | 'decelerating' | 'stable';
type VolumeLabel = 'high' | 'neutral' | 'low';
type Signal = 'buy' | 'sell' | 'hold';
type Confidence = 'high' | 'medium' | 'low';

function chipColor(kind: 'pos' | 'neg' | 'neu' | 'warn') {
  if (kind === 'pos') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
  if (kind === 'neg') return 'bg-rose-500/15 text-rose-300 border-rose-500/20';
  if (kind === 'warn') return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  return 'bg-neutral-500/10 text-neutral-300 border-white/10';
}

function directionChip(direction: Direction) {
  if (direction === 'upward') return { kind: 'pos' as const, label: 'upward', Icon: ArrowUpRight };
  if (direction === 'downward') return { kind: 'neg' as const, label: 'downward', Icon: ArrowDownRight };
  return { kind: 'neu' as const, label: 'mixed', Icon: Minus };
}

function accelChip(acc: Acceleration) {
  if (acc === 'accelerating') return { kind: 'pos' as const, label: 'accelerating' };
  if (acc === 'decelerating') return { kind: 'warn' as const, label: 'decelerating' };
  return { kind: 'neu' as const, label: 'stable' };
}

function volumeChip(v: VolumeLabel) {
  if (v === 'high') return { kind: 'pos' as const, label: 'high' };
  if (v === 'low') return { kind: 'warn' as const, label: 'low' };
  return { kind: 'neu' as const, label: 'neutral' };
}

function alignmentChip(a: string) {
  if (a === 'strong_bullish') return { kind: 'pos' as const, label: 'strong bullish' };
  if (a === 'strong_bearish') return { kind: 'neg' as const, label: 'strong bearish' };
  return { kind: 'neu' as const, label: 'mixed' };
}

function signalChip(s: Signal) {
  if (s === 'buy') return { kind: 'pos' as const, label: 'buy' };
  if (s === 'sell') return { kind: 'neg' as const, label: 'sell' };
  return { kind: 'neu' as const, label: 'hold' };
}

function confidenceChip(c: Confidence) {
  if (c === 'high') return { kind: 'pos' as const, label: 'high' };
  if (c === 'medium') return { kind: 'warn' as const, label: 'medium' };
  return { kind: 'neg' as const, label: 'low' };
}

function cmp(a: number, b: number) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function microTrend(ticks: { price: number; timestamp: string }[]) {
  const last3 = ticks.slice(-3);
  const p1 = last3[0]?.price;
  const p2 = last3[1]?.price;
  const p3 = last3[2]?.price;
  if (typeof p1 !== 'number' || typeof p2 !== 'number' || typeof p3 !== 'number') {
    return { direction: 'mixed' as Direction, acceleration: 'stable' as Acceleration, reversal: true };
  }

  const direction: Direction =
    p1 < p2 && p2 < p3 ? 'upward' : p1 > p2 && p2 > p3 ? 'downward' : 'mixed';

  const d1 = p2 - p1;
  const d2 = p3 - p2;
  const acceleration: Acceleration = d2 > d1 ? 'accelerating' : d2 < d1 ? 'decelerating' : 'stable';

  const reversal = (p1 > p2 && p2 < p3) || (p1 < p2 && p2 > p3);
  return { direction, acceleration, reversal };
}

function volumeLabel(volume: number, avgVolume: number): VolumeLabel {
  const c = cmp(volume, avgVolume);
  if (c > 0) return 'high';
  if (c < 0) return 'low';
  return 'neutral';
}

function alignmentLabel(d1: Direction, d5: Direction, d1h: Direction) {
  if (d1 === 'upward' && d5 === 'upward' && d1h === 'upward') return 'strong_bullish';
  if (d1 === 'downward' && d5 === 'downward' && d1h === 'downward') return 'strong_bearish';
  return 'mixed';
}

function signalEngine(data: CoffeeLevel4) {
  const t1 = microTrend(data.ticks_1m);
  const t5 = microTrend(data.ticks_5m);
  const t1h = microTrend(data.ticks_1h);

  const aligned = alignmentLabel(t1.direction, t5.direction, t1h.direction);
  const vol = volumeLabel(data.volume, data.avgVolume);

  const p3 = data.ticks_1m[data.ticks_1m.length - 1]?.price;
  const vsPrev = typeof p3 === 'number' ? (cmp(p3, data.previousClose) > 0 ? 'above' : cmp(p3, data.previousClose) < 0 ? 'below' : 'equal') : 'equal';

  let signal: Signal = 'hold';
  if (aligned === 'strong_bullish' && t1.acceleration === 'accelerating' && vol === 'high' && vsPrev === 'above' && !t1.reversal) {
    signal = 'buy';
  } else if (aligned === 'strong_bearish' && t1.acceleration === 'accelerating' && vol === 'high' && vsPrev === 'below' && !t1.reversal) {
    signal = 'sell';
  }

  let score = 0;
  if (signal === 'buy') {
    score += t1.direction === 'upward' ? 1 : 0;
    score += t5.direction === 'upward' ? 1 : 0;
    score += t1h.direction === 'upward' ? 1 : 0;
  } else if (signal === 'sell') {
    score += t1.direction === 'downward' ? 1 : 0;
    score += t5.direction === 'downward' ? 1 : 0;
    score += t1h.direction === 'downward' ? 1 : 0;
  }
  score += t1.acceleration === 'accelerating' ? 1 : 0;
  score += vol === 'high' ? 1 : 0;
  if (score < 0) score = 0;
  if (score > 5) score = 5;

  const confidence: Confidence = score <= 2 ? 'low' : score <= 4 ? 'medium' : 'high';
  const rangeValid = data.high >= data.low;

  return { t1, t5, t1h, aligned, vol, signal, score, confidence, vsPrev, rangeValid };
}

function freshnessBadge(now: number, fetchedAtIso?: string) {
  if (!fetchedAtIso) return { label: 'unknown', className: 'bg-neutral-500/10 text-neutral-300 border-white/10' };
  const t = Date.parse(fetchedAtIso);
  if (Number.isNaN(t)) return { label: 'unknown', className: 'bg-neutral-500/10 text-neutral-300 border-white/10' };
  const ageMs = now - t;
  const ageMin = Math.max(0, Math.round(ageMs / 60000));
  if (ageMs <= 15 * 60000) return { label: `${ageMin}m fresh`, className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' };
  if (ageMs <= 60 * 60000) return { label: `${ageMin}m aging`, className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' };
  return { label: `${ageMin}m stale`, className: 'bg-rose-500/15 text-rose-300 border-rose-500/20' };
}

function toSeries(ticks: { price: number; timestamp: string }[]) {
  return ticks.map((t) => ({
    t: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: t.price,
  }));
}

function moversHistogram(movers: { changePercent: number }[]) {
  const vals = movers.map((m) => m.changePercent).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return [];
  const min = Math.floor(Math.min(...vals));
  const max = Math.ceil(Math.max(...vals));
  const buckets: Record<string, number> = {};
  for (let b = min; b <= max; b++) {
    const k = `${b}`;
    buckets[k] = 0;
  }
  for (const v of vals) {
    const b = `${Math.floor(v)}`;
    if (buckets[b] != null) buckets[b] += 1;
  }
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket: `${bucket}%`, count }));
}

export function MarketView() {
  const [contextMemo, setContextMemo] = useState<MarketCoffeeLatest | null>(null);
  const [level4, setLevel4] = useState<CoffeeLevel4 | null>(null);
  const [movers, setMovers] = useState<CommodityMovers | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [buyOrders, setBuyOrders] = useState<BuyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = async () => {
    try {
      const [memo, l4, mv, s, b] = await Promise.all([
        coreDataApi.getMarketCoffeeLatest(),
        coreDataApi.getCoffeeLevel4(),
        coreDataApi.getCommodityMovers(),
        coreDataApi.getSales(),
        coreDataApi.getBuyOrders(),
      ]);
      setContextMemo(memo);
      setLevel4(l4);
      setMovers(mv);
      setSales(Array.isArray(s) ? s.slice(0, 8) : []);
      setBuyOrders(Array.isArray(b) ? b.slice(0, 8) : []);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || 'Failed to load market intelligence'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      refreshAll();
    }, 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const now = Date.now();
  const coffeeBadge = freshnessBadge(now, level4?.fetchedAt);
  const moversBadge = freshnessBadge(now, movers?.fetchedAt);
  const engine = useMemo(() => (level4 ? signalEngine(level4) : null), [level4]);
  const hist = useMemo(() => moversHistogram((movers?.movers || []).slice(0, 30)), [movers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-white">Market Intelligence</h2>
          <p className="text-sm text-neutral-500 mt-1">Trading signals, movers, and decision-grade context</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error && (
            <div className="text-xs font-bold uppercase tracking-widest text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-full">
              {error}
            </div>
          )}
          <div className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border", coffeeBadge.className)}>
            <Clock size={14} />
            Coffee {coffeeBadge.label}
          </div>
          <div className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border", moversBadge.className)}>
            <Clock size={14} />
            Movers {moversBadge.label}
          </div>
          <button
            onClick={() => refreshAll()}
            className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-surface border border-brand-border text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-surface border border-brand-border text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-2"
          >
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
            {autoRefresh ? 'Auto' : 'Paused'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Coffee (KC=F) · Multi-timeframe</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="text-2xl font-bold text-white">{level4?.price?.toFixed ? level4.price.toFixed(2) : '-'}</div>
                <div className="text-xs text-neutral-400">{level4?.currency || ''}</div>
                <div className="text-xs text-neutral-500">prev {level4?.previousClose?.toFixed ? level4.previousClose.toFixed(2) : '-'}</div>
              </div>
            </div>
            {engine && (
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(signalChip(engine.signal).kind))}>
                    {engine.signal}
                  </div>
                  <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(confidenceChip(engine.confidence).kind))}>
                    confidence {engine.confidence}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 w-6 rounded-full border",
                        i < engine.score ? "bg-white/60 border-white/10" : "bg-white/5 border-white/10"
                      )}
                    />
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-neutral-500 uppercase tracking-widest">score {engine.score}/5</div>
              </div>
            )}
          </div>

          {level4 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: '1m', color: '#a78bfa', ticks: level4.ticks_1m },
                { label: '5m', color: '#60a5fa', ticks: level4.ticks_5m },
                { label: '1h', color: '#34d399', ticks: level4.ticks_1h },
              ].map((t) => (
                <div key={t.label} className="h-40">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">{t.label}</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={toSeries(t.ticks)}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={38} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                      <Line type="monotone" dataKey="price" stroke={t.color} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {engine && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Micro-trend</div>
                <div className="space-y-2">
                  {[
                    { tf: '1m', t: engine.t1 },
                    { tf: '5m', t: engine.t5 },
                    { tf: '1h', t: engine.t1h },
                  ].map(({ tf, t }) => {
                    const d = directionChip(t.direction);
                    const a = accelChip(t.acceleration);
                    return (
                      <div key={tf} className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-neutral-500 w-8">{tf}</div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(d.kind))}>
                            <d.Icon size={14} />
                            {d.label}
                          </div>
                          <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(a.kind))}>
                            {a.label}
                          </div>
                          <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(t.reversal ? 'warn' : 'neu'))}>
                            {t.reversal ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                            reversal {t.reversal ? 'yes' : 'no'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Confirmations</div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(alignmentChip(engine.aligned).kind))}>
                      alignment {alignmentChip(engine.aligned).label}
                    </div>
                    <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(volumeChip(engine.vol).kind))}>
                      volume {engine.vol}
                    </div>
                    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(engine.rangeValid ? 'pos' : 'neg'))}>
                      {engine.rangeValid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      range {engine.rangeValid ? 'valid' : 'invalid'}
                    </div>
                    <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(engine.vsPrev === 'above' ? 'pos' : engine.vsPrev === 'below' ? 'neg' : 'neu'))}>
                      vs prevClose {engine.vsPrev}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Decision</div>
                      <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border", chipColor(signalChip(engine.signal).kind))}>
                        {engine.signal}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-300">
                      {engine.signal === 'hold' ? 'Hold (not actionable)' : 'Actionable signal'}
                    </div>
                    <div className="mt-2 text-xs text-neutral-500">
                      {typeof level4?.volume === 'number' && typeof level4?.avgVolume === 'number'
                        ? `volume ${level4.volume} vs avg ${level4.avgVolume}`
                        : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl"
        >
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Top movers (today)</div>
          <div className="mt-4 space-y-2">
            {(movers?.movers || []).slice(0, 10).map((m) => (
              <div key={m.symbol} className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-neutral-200">{m.symbol}</div>
                <div className={cn("text-sm font-bold tabular-nums", m.changePercent >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {m.changePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(movers?.movers || []).slice(0, 10).map((m) => ({ symbol: m.symbol, v: Number(m.changePercent.toFixed(2)) }))}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="symbol" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={38} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="v" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Market breadth</div>
              <div className="text-sm font-bold text-white mt-1">Mover distribution (change % buckets)</div>
            </div>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={38} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="count" fill="#a78bfa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-neutral-500">Based on top movers list (up to 30 symbols).</div>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Live activity</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Latest sales</div>
              <div className="space-y-2">
                {sales.slice(0, 4).map((s) => (
                  <div key={s._id} className="text-xs text-neutral-200 flex items-center justify-between gap-3">
                    <div className="truncate">{s.commodity} · {s.incoterm} · {s.origin}</div>
                    <div className="text-neutral-500">{new Date(s.createdAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Latest buy orders</div>
              <div className="space-y-2">
                {buyOrders.slice(0, 4).map((b) => (
                  <div key={b._id} className="text-xs text-neutral-200 flex items-center justify-between gap-3">
                    <div className="truncate">{b.commodity} · {b.destination}</div>
                    <div className="text-neutral-500">{new Date(b.createdAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-brand-surface border border-brand-border rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <TrendingUp size={120} />
        </div>

        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <TrendingUp className="text-blue-400" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Context feed (memo)</h3>
              <a 
                href={contextMemo?.latest.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 mt-0.5"
              >
                View Original Source <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className={cn(
            "text-sm text-neutral-300 leading-relaxed font-medium transition-all duration-700 overflow-hidden markdown-body prose prose-invert prose-sm max-w-none",
            isExpanded ? "max-h-[5000px]" : "max-h-48"
          )}>
            <ReactMarkdown>{contextMemo?.latest.memoText || ''}</ReactMarkdown>
          </div>
          {!isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-brand-surface via-brand-surface/80 to-transparent" />
          )}
        </div>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-3 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-all border-t border-brand-border mt-4 flex items-center justify-center gap-2 group"
        >
          {isExpanded ? 'Collapse Intelligence' : 'Expand Full Intelligence'}
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
            <Clock size={14} className="group-hover:text-blue-400 transition-colors" />
          </motion.div>
        </button>
      </motion.div>
    </div>
  );
};
