import { useEffect, useState } from 'react';
import { Sale } from '../../types/comex';
import { coreDataApi } from '../../lib/api';
import { motion } from 'motion/react';
import { ShoppingBag, MapPin, Calendar, DollarSign, Package, X, Copy } from 'lucide-react';

export function SalesList() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const data = await coreDataApi.getSales();
        setSales(data);
      } catch (err) {
        setError('Failed to fetch sales records');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSales();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-blue-400" />
          Sales Records
        </h2>
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          {sales.length} Total
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sales.map((sale) => (
          <motion.div
            key={sale._id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setSelectedSale(sale)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
                    {sale.commodity}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                    {sale.incoterm}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-zinc-100 flex items-center justify-end gap-1">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  {sale.price.toLocaleString()}
                </div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                  {sale.volume}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{sale.origin}</span>
                </div>
                <div className="w-4 h-px bg-zinc-800" />
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{sale.destination}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-widest pt-2">
                <Calendar className="w-3 h-3" />
                {new Date(sale.createdAt).toLocaleDateString()}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-800/50">
              <h3 className="font-bold text-white uppercase tracking-widest text-sm">Sale Detail</h3>
              <button onClick={() => setSelectedSale(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
               <pre className="text-xs text-zinc-300 font-mono bg-black/30 p-4 rounded-xl overflow-x-auto border border-zinc-800">
                 {JSON.stringify(selectedSale, null, 2)}
               </pre>
               <div className="mt-6 flex justify-end">
                 <button 
                   onClick={() => {
                     navigator.clipboard.writeText(JSON.stringify(selectedSale, null, 2));
                   }}
                   className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors"
                 >
                   <Copy size={16} />
                   Copy JSON
                 </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
