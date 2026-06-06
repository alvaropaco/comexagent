import React, { useState, useEffect } from 'react';
import Lottie from 'lottie-react';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Mail, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

function normalizeLottieJson(input: any): any | null {
  if (!input) return null;
  if (typeof input === 'object' && Array.isArray(input.layers)) return input;
  if (Array.isArray(input)) {
    const layers = input.map((layer: any, idx: number) => {
      if (!layer || typeof layer !== 'object') return layer;
      if (typeof layer.ind === 'number') return layer;

      const ks = layer.ks && typeof layer.ks === 'object' ? layer.ks : {};
      const withKs = {
        ...layer,
        ks: {
          o: ks.o,
          p: ks.p,
          s: ks.s,
          r: ks.r ?? { a: 0, k: 0 },
          a: ks.a ?? { a: 0, k: [0, 0, 0] },
        },
      };

      const t = withKs.t && typeof withKs.t === 'object' ? withKs.t : null;
      const d = t && (t as any).d && typeof (t as any).d === 'object' ? (t as any).d : null;
      const k = d && Array.isArray((d as any).k) ? (d as any).k : null;
      if (k && k[0] && typeof k[0] === 'object' && (k[0] as any).t == null) {
        (k[0] as any).t = 0;
      }

      return { ...withKs, ind: idx + 1 };
    });
    return {
      v: '5.7.4',
      fr: 30,
      ip: 0,
      op: 180,
      w: 840,
      h: 600,
      nm: 'COMEX',
      ddd: 0,
      assets: [],
      layers,
    };
  }
  return null;
}

export const Login = () => {
  const { loginWithGoogle, setupRecaptcha, signInWithPhone, isLoggingIn } = useAuth();
  const [method, setMethod] = useState<'initial' | 'phone'>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    if (method === 'phone') {
      setupRecaptcha('recaptcha-container');
    }
  }, [method]);

  useEffect(() => {
    let cancelled = false;
    fetch('/animation.json')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setAnimationData(normalizeLottieJson(json));
      })
      .catch(() => {
        if (!cancelled) setAnimationData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPhone(phoneNumber);
      setConfirmationResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmationResult.confirm(verificationCode);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0d0d14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 400 }}>
        {animationData ? (
          <div className="w-full h-64 mb-8">
            <Lottie animationData={animationData} loop={true} autoplay={true} />
          </div>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-brand-surface border border-brand-border rounded-3xl p-8 shadow-2xl"
        >
        <div className="flex flex-col items-center mb-10">
          <div className="relative w-20 h-20 mb-6">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <linearGradient id="loginLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E099FF" />
                  <stop offset="100%" stopColor="#8A3FFC" />
                </linearGradient>
              </defs>
              <circle cx="70" cy="55" r="22" fill="url(#loginLogoGradient)" />
              <circle cx="35" cy="40" r="12" fill="url(#loginLogoGradient)" />
              <circle cx="50" cy="60" r="10" fill="url(#loginLogoGradient)" />
              <circle cx="25" cy="65" r="10" fill="url(#loginLogoGradient)" />
              <path d="M35 40 Q42 50 50 60" stroke="url(#loginLogoGradient)" strokeWidth="8" strokeLinecap="round" />
              <path d="M25 65 Q37 62 50 60" stroke="url(#loginLogoGradient)" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Comex</h1>
            <h1 className="text-3xl font-light text-brand-accent tracking-tight">Agent</h1>
          </div>
          <p className="text-neutral-400 text-center text-sm">
            The AI-native commodities trading marketplace.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {method === 'initial' ? (
            <motion.div 
              key="initial"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <button 
                onClick={() => loginWithGoogle()}
                disabled={isLoggingIn}
                className="w-full bg-brand-accent text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : <Mail size={20} />}
                {isLoggingIn ? 'Connecting...' : 'Continue with Google'}
              </button>

              <button 
                onClick={() => setMethod('phone')}
                className="w-full bg-brand-primary border border-brand-border text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-neutral-800 transition-all active:scale-[0.98]"
              >
                <Phone size={20} />
                Continue with Phone
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <button 
                onClick={() => {
                  setMethod('initial');
                  setConfirmationResult(null);
                  setError(null);
                }}
                className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft size={16} />
                Back to options
              </button>

              {!confirmationResult ? (
                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Phone Number</label>
                    <input 
                      type="tel" 
                      placeholder="+1 234 567 8900"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-black border border-brand-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-accent text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Code'}
                    {!loading && <ChevronRight size={20} />}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Verification Code</label>
                    <input 
                      type="text" 
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="w-full bg-black border border-brand-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-center tracking-[0.5em] font-bold text-xl"
                      maxLength={6}
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-accent text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Login'}
                  </button>
                </form>
              )}

              {error && (
                <p className="text-rose-400 text-xs text-center font-medium bg-rose-400/10 py-3 rounded-xl border border-rose-400/20">
                  {error}
                </p>
              )}

              <div id="recaptcha-container"></div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 pt-6 border-t border-brand-border text-center">
          <p className="text-neutral-500 text-[10px] uppercase tracking-widest leading-relaxed">
            By continuing, you agree to our <br />
            <span className="text-neutral-400 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-neutral-400 hover:underline cursor-pointer">Privacy Policy</span>
          </p>
        </div>
        </motion.div>
      </div>
    </div>
  );
};
