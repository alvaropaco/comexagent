import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { coreDataApi } from "../../lib/api";
import type { ChartSeries, CoffeeLevel4, CommodityMovers } from "../../types/comex";
import { cn } from "../../lib/utils";

function toLine(series: { price: number; timestamp: string }[]) {
  return series.map((p) => ({
    t: new Date(p.timestamp).toLocaleDateString([], { month: "short", day: "2-digit" }),
    price: p.price,
  }));
}

function dailyReturns(series: { price: number; timestamp: string }[]) {
  const out: { t: string; ret: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]?.price;
    const cur = series[i]?.price;
    if (typeof prev !== "number" || typeof cur !== "number" || prev <= 0) continue;
    const r = (cur - prev) / prev;
    if (!Number.isFinite(r)) continue;
    out.push({
      t: new Date(series[i].timestamp).toLocaleDateString([], { month: "short", day: "2-digit" }),
      ret: Number((r * 100).toFixed(2)),
    });
  }
  return out;
}

function histogram(values: number[], step = 0.5) {
  if (values.length === 0) return [];
  const min = Math.floor(Math.min(...values) / step) * step;
  const max = Math.ceil(Math.max(...values) / step) * step;
  const buckets: Record<string, number> = {};
  for (let v = min; v <= max; v += step) buckets[v.toFixed(1)] = 0;
  for (const v of values) {
    const b = (Math.floor(v / step) * step).toFixed(1);
    if (buckets[b] != null) buckets[b] += 1;
  }
  return Object.entries(buckets).map(([b, count]) => ({ bucket: `${b}%`, count }));
}

function badge(kind: "pos" | "neg" | "neu") {
  if (kind === "pos") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
  if (kind === "neg") return "bg-rose-500/15 text-rose-300 border-rose-500/20";
  return "bg-neutral-500/10 text-neutral-300 border-white/10";
}

function changePct(a?: number, b?: number) {
  if (typeof a !== "number" || typeof b !== "number" || a <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return ((b - a) / a) * 100;
}

function stddev(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const varr = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(varr);
}

export function InsightsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series1y, setSeries1y] = useState<ChartSeries | null>(null);
  const [level4, setLevel4] = useState<CoffeeLevel4 | null>(null);
  const [movers, setMovers] = useState<CommodityMovers | null>(null);

  const refresh = async () => {
    try {
      const [s1y, l4, mv] = await Promise.all([
        coreDataApi.getChartSeries({ symbol: "KC=F", interval: "1d", range: "1y" }),
        coreDataApi.getCoffeeLevel4(),
        coreDataApi.getCommodityMovers(),
      ]);
      setSeries1y(s1y);
      setLevel4(l4);
      setMovers(mv);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load insights"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const line1y = useMemo(() => (series1y ? toLine(series1y.series) : []), [series1y]);
  const rets = useMemo(() => (series1y ? dailyReturns(series1y.series) : []), [series1y]);
  const retHist = useMemo(() => histogram(rets.map((r) => r.ret)), [rets]);
  const moversHist = useMemo(() => {
    const vals = (movers?.movers || []).map((m) => m.changePercent).filter((v) => Number.isFinite(v));
    return histogram(vals, 0.5);
  }, [movers]);

  const lastPrice = series1y?.series?.[series1y.series.length - 1]?.price;
  const firstPrice = series1y?.series?.[0]?.price;
  const yearDir = typeof lastPrice === "number" && typeof firstPrice === "number" && firstPrice > 0 ? (lastPrice > firstPrice ? "pos" : lastPrice < firstPrice ? "neg" : "neu") : "neu";

  const s = series1y?.series || [];
  const d1 = changePct(s[s.length - 2]?.price, s[s.length - 1]?.price);
  const d30 = changePct(s[Math.max(0, s.length - 31)]?.price, s[s.length - 1]?.price);
  const d90 = changePct(s[Math.max(0, s.length - 91)]?.price, s[s.length - 1]?.price);

  const moverVals = (movers?.movers || []).map((m) => m.changePercent).filter((v) => Number.isFinite(v)) as number[];
  const gainers = moverVals.filter((v) => v > 0).length;
  const losers = moverVals.filter((v) => v < 0).length;
  const dispersion = stddev(moverVals);

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
        <div>
          <h2 className="text-2xl font-bold text-white">Insights & Indices</h2>
          <p className="text-sm text-neutral-500 mt-1">Real data: trend, dispersion, and market breadth</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error && (
            <div className="text-xs font-bold uppercase tracking-widest text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-full">
              {error}
            </div>
          )}
          <div className={cn("flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border", badge(yearDir))}>
            <BarChart3 size={14} />
            KC=F 1Y
          </div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border bg-neutral-500/10 text-neutral-300 border-white/10">
            <Clock size={14} />
            {series1y?.fetchedAt ? new Date(series1y.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-brand-surface border border-brand-border text-neutral-200 hover:bg-neutral-800 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "KC=F 1D", v: d1, kind: typeof d1 === "number" ? (d1 > 0 ? "pos" : d1 < 0 ? "neg" : "neu") : "neu" },
            { label: "KC=F 30D", v: d30, kind: typeof d30 === "number" ? (d30 > 0 ? "pos" : d30 < 0 ? "neg" : "neu") : "neu" },
            { label: "KC=F 90D", v: d90, kind: typeof d90 === "number" ? (d90 > 0 ? "pos" : d90 < 0 ? "neg" : "neu") : "neu" },
            { label: "Dispersion", v: dispersion, kind: "neu" as const },
          ].map((k) => (
            <div key={k.label} className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-lg">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{k.label}</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-xl font-bold text-white tabular-nums">
                  {typeof k.v === "number" ? (k.label === "Dispersion" ? k.v.toFixed(2) : `${k.v.toFixed(2)}%`) : "—"}
                </div>
                <div className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border", badge(k.kind as any))}>
                  {k.kind === "pos" ? "up" : k.kind === "neg" ? "down" : "flat"}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Coffee index (KC=F)</div>
              <div className="mt-1 text-sm text-neutral-400">1y · 1d close series</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white tabular-nums">{typeof lastPrice === "number" ? lastPrice.toFixed(2) : "—"}</div>
              <div className="text-xs text-neutral-500">{series1y?.currency || ""}</div>
            </div>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={line1y}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} minTickGap={18} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={48} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Line type="monotone" dataKey="price" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-neutral-400" />
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Realtime snapshot</div>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-neutral-400">Price</div>
              <div className="text-white font-bold tabular-nums">{level4?.price?.toFixed ? level4.price.toFixed(2) : "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-neutral-400">Prev close</div>
              <div className="text-white font-bold tabular-nums">{level4?.previousClose?.toFixed ? level4.previousClose.toFixed(2) : "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-neutral-400">Range</div>
              <div className="text-white font-bold tabular-nums">
                {level4?.low?.toFixed ? level4.low.toFixed(2) : "—"}–{level4?.high?.toFixed ? level4.high.toFixed(2) : "—"}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-neutral-400">Volume vs avg</div>
              <div className="text-white font-bold tabular-nums">
                {typeof level4?.volume === "number" ? level4.volume : "—"} / {typeof level4?.avgVolume === "number" ? level4.avgVolume : "—"}
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-neutral-500">{level4?.fetchedAt ? `fetchedAt ${new Date(level4.fetchedAt).toLocaleTimeString()}` : ""}</div>
          <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
            <div>Market breadth</div>
            <div className="tabular-nums">{gainers} gainers · {losers} losers</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Daily return distribution</div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={retHist}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} minTickGap={10} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={38} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="count" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-neutral-500">Counts of daily close-to-close moves (percent buckets).</div>
        </div>

        <div className="lg:col-span-2 bg-brand-surface border border-brand-border rounded-2xl p-6 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Market breadth (commodities)</div>
          <div className="mt-1 text-sm text-neutral-400">Mover distribution from today’s movers list</div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moversHist}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} minTickGap={10} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={38} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="count" fill="#a78bfa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-neutral-500">{movers?.fetchedAt ? `fetchedAt ${new Date(movers.fetchedAt).toLocaleTimeString()}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
