import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Zap, Crown, Loader2, X } from 'lucide-react';
import { useAuth } from '../AuthContext';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const { user, isPremium, refreshSubscription } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  if (isPremium && isOpen) {
    onClose();
    return null;
  }

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!user) return;
    setLoading(plan);
    
    const priceId = plan === 'monthly' 
      ? import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID 
      : import.meta.env.VITE_STRIPE_YEARLY_PRICE_ID;

    if (!priceId) {
      console.error(`Stripe ${plan} Price ID is missing. Please set VITE_STRIPE_${plan.toUpperCase()}_PRICE_ID in your environment variables.`);
      alert(`Subscription plan '${plan}' is not correctly configured. Please contact support.`);
      setLoading(null);
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          priceId,
          firebaseUID: user.uid,
          email: user.email,
        }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to initiate checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const features = [
    "Unlimited AI Trade Copilot messages",
    "Real-time market matching engine",
    "Advanced commodity price analytics",
    "Priority access to new trade insights",
    "Global logistics & freight tracking",
    "Direct trader-to-trader messaging"
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-4xl bg-brand-surface border border-brand-border rounded-[32px] overflow-hidden shadow-2xl flex flex-col md:flex-row"
          >
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 z-20 p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
            >
              <X size={20} />
            </button>

            {/* Left Side: Value Prop */}
            <div className="flex-1 p-8 md:p-12 bg-gradient-to-br from-neutral-900 to-black border-r border-brand-border">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest mb-6">
                <Crown size={12} className="text-yellow-500" />
                Premium Access
              </div>
              
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight leading-tight">
                Unlock the full power of <span className="text-white font-bold">Comex</span> <span className="text-brand-accent font-light">Agent</span>
              </h2>
              
              <p className="text-neutral-400 mb-10 leading-relaxed">
                Join elite commodity traders using AI to find better matches, predict price shifts, and streamline international trade.
              </p>

              <ul className="space-y-4">
                {features.map((feature, i) => (
                  <motion.li 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 text-sm text-neutral-300"
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <Check size={12} className="text-emerald-500" />
                    </div>
                    {feature}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Right Side: Pricing */}
            <div className="w-full md:w-[380px] p-8 md:p-12 flex flex-col justify-center gap-6">
              {/* Monthly */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-white/10 to-transparent rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
                <div className="relative bg-black border border-brand-border p-6 rounded-2xl hover:border-white/30 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">Monthly</h3>
                      <p className="text-xs text-neutral-500">Flexible commitment</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">$99</p>
                      <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-tighter">per month</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSubscribe('monthly')}
                    disabled={!!loading}
                    className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading === 'monthly' ? <Loader2 className="animate-spin" size={18} /> : 'Select Monthly'}
                  </button>
                </div>
              </div>

              {/* Yearly */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-accent/20 to-transparent rounded-2xl blur opacity-100 transition duration-500" />
                <div className="relative bg-black border border-brand-accent/30 p-6 rounded-2xl hover:border-brand-accent transition-all">
                  <div className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-brand-accent text-black text-[10px] font-bold uppercase tracking-widest">
                    Best Value
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">Yearly</h3>
                      <p className="text-xs text-neutral-500">Save 25% annually</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">$899</p>
                      <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-tighter">per year</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSubscribe('yearly')}
                    disabled={!!loading}
                    className="w-full py-3 rounded-xl bg-brand-accent text-white hover:bg-brand-purple-dark font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading === 'yearly' ? <Loader2 className="animate-spin" size={18} /> : 'Select Yearly'}
                    {!loading && <Zap size={16} fill="currentColor" />}
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-brand-border">
                <p className="text-[10px] text-neutral-500 text-center uppercase tracking-widest mb-2">
                  Already subscribed?
                </p>
                <button 
                  onClick={async () => {
                    setLoading('refresh');
                    await refreshSubscription();
                    setLoading(null);
                  }}
                  disabled={!!loading}
                  className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {loading === 'refresh' ? <Loader2 className="animate-spin mx-auto" size={14} /> : 'Refresh Status'}
                </button>
              </div>

              <p className="text-[10px] text-neutral-600 text-center uppercase tracking-widest">
                Secure payment via Stripe
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
