import { TrendingUp, Clock } from 'lucide-react';
import { MarketCoffeeLatest } from '../../types/comex';
import { motion } from 'motion/react';

interface MarketContextBadgeProps {
  marketData: MarketCoffeeLatest | null;
}

export function MarketContextBadge({ marketData }: MarketContextBadgeProps) {
  if (!marketData || !marketData.ok || !marketData.latest) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400 group cursor-pointer hover:border-zinc-700 transition-colors"
    >
      <TrendingUp className="w-3.5 h-3.5 text-brand-accent" />
      <span className="text-[10px] font-bold uppercase tracking-wider">Market context available</span>
      <div className="flex items-center gap-1 ml-2 pl-2 border-l border-zinc-800">
        <Clock className="w-3 h-3 text-zinc-500" />
        <span className="text-[10px] text-zinc-500 font-medium">
          {new Date(marketData.latest.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
};
