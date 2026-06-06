import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { coreDataApi } from "../../lib/api";
import { cn } from "../../lib/utils";
import type { CoffeeLevel4, MarketSignalLine, TickPoint } from "../../types/comex";
import { parseMarketSignal } from "../../lib/structured";

function toSeries(ticks: TickPoint[]) {
  return ticks.map((t) => ({
    t: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    price: t.price,
  }));
}

function badgeColor(v?: string) {
  const x = (v || "").toLowerCase();
  if (x === "buy" || x === "bullish" || x === "high") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
  if (x === "sell" || x === "bearish" || x === "low") return "bg-rose-500/15 text-rose-300 border-rose-500/20";
  return "bg-neutral-500/10 text-neutral-300 border-white/10";
}

export function ChatMarketInsights({ rawText }: { rawText: string }) {
  const parsed = useMemo<MarketSignalLine | null>(() => parseMarketSignal(rawText), [rawText]);
  const [data, setData] = useState<CoffeeLevel4 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    coreDataApi
      .getCoffeeLevel4()
      .then((d) => {
        if (!mounted) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(String(e?.message || "Failed to fetch"));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!parsed) return null;

  const volBars = data
    ? [
        { name: "volume", value: data.volume },
        { name: "avgVolume", value: data.avgVolume },
      ]
    : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Signal</div>
          <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border", badgeColor(parsed.signal))}>
            {parsed.signal}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Confidence</div>
          <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border", badgeColor(parsed.confidence))}>
            {parsed.confidence}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Score</div>
          <div className="text-sm font-bold text-white">{typeof parsed.score === "number" ? parsed.score : "-"}</div>
        </div>
      </div>

      <div className="text-xs text-neutral-400">
        Alignment: 1m {parsed.alignment1m || "-"}, 5m {parsed.alignment5m || "-"}, 1h {parsed.alignment1h || "-"} · Volume: {parsed.volume || "-"}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-xs font-bold text-white">Multi-timeframe ticks (Yahoo)</div>
          <div className="text-[10px] text-neutral-500">
            {loading ? "loading…" : error ? "data unavailable" : data?.fetchedAt ? `fetchedAt ${new Date(data.fetchedAt).toLocaleTimeString()}` : ""}
          </div>
        </div>

        {error ? (
          <div className="text-xs text-neutral-400">{error}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data && (
              <>
                <div className="h-40">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">1m</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={toSeries(data.ticks_1m)}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={36} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                      <Line type="monotone" dataKey="price" stroke="#a78bfa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-40">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">5m</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={toSeries(data.ticks_5m)}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={36} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                      <Line type="monotone" dataKey="price" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-40">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">1h</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={toSeries(data.ticks_1h)}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={36} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                      <Line type="monotone" dataKey="price" stroke="#34d399" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {data && (
          <div className="mt-4 h-40">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Volume vs Avg</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volBars}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={44} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="value" fill="#a78bfa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
