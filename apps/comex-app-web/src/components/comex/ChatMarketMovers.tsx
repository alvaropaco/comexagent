import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { coreDataApi } from "../../lib/api";
import type { CommodityMovers, CommodityMover } from "../../types/comex";
import { isMarketMoversText } from "../../lib/structured";

function split(movers: CommodityMover[]) {
  const gainers = movers.filter((m) => m.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
  const losers = movers.filter((m) => m.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
  return { gainers, losers };
}

export function ChatMarketMovers({ rawText }: { rawText: string }) {
  const enabled = useMemo(() => isMarketMoversText(rawText), [rawText]);
  const [data, setData] = useState<CommodityMovers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setLoading(true);
    coreDataApi
      .getCommodityMovers()
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
  }, [enabled]);

  if (!enabled) return null;

  const movers = data?.movers || [];
  const top = movers.slice(0, 10);
  const chartData = top.map((m) => ({
    symbol: m.symbol,
    changePercent: Number(m.changePercent.toFixed(2)),
  }));
  const { gainers, losers } = split(movers);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="text-xs font-bold text-white">Commodity movers (Yahoo)</div>
          <div className="text-[10px] text-neutral-500">
            {loading ? "loading…" : error ? "data unavailable" : data?.fetchedAt ? `fetchedAt ${new Date(data.fetchedAt).toLocaleTimeString()}` : ""}
          </div>
        </div>

        {error ? (
          <div className="text-xs text-neutral-400">{error}</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="symbol" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }} />
                <Bar dataKey="changePercent" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {movers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Top gainers</div>
            <div className="space-y-1 text-sm">
              {gainers.slice(0, 5).map((m) => (
                <div key={m.symbol} className="flex items-center justify-between">
                  <div className="text-neutral-200 font-medium">{m.symbol}</div>
                  <div className="text-emerald-300 font-bold">{m.changePercent.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Top losers</div>
            <div className="space-y-1 text-sm">
              {losers.slice(0, 5).map((m) => (
                <div key={m.symbol} className="flex items-center justify-between">
                  <div className="text-neutral-200 font-medium">{m.symbol}</div>
                  <div className="text-rose-300 font-bold">{m.changePercent.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

