import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, Link, Navigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { 
  LayoutDashboard, 
  MessageSquare, 
  ShoppingBag, 
  TrendingUp, 
  FileText, 
  Users, 
  Settings, 
  Plus, 
  Search, 
  Bell, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  Send,
  Paperclip,
  Filter,
  Globe,
  BarChart3,
  Zap,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LogOut,
  Crown,
  ShoppingCart,
  Terminal,
  Database,
  Copy,
  Info,
  Shield,
  ExternalLink,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { marketplaceApi, Match, MatchExplanation } from './lib/api';
import { comexApi, coreDataApi } from './lib/api';
import { ComexResponse, Operation, Roles, AgentOutput, ToolResult, MarketCoffeeLatest, Sale, BuyOrder } from './types/comex';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './components/Login';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PaywallModal } from './components/PaywallModal';
import { OperationEnvelope } from './components/comex/OperationEnvelope';
import { RolesPanel } from './components/comex/RolesPanel';
import { MarketContextBadge } from './components/comex/MarketContextBadge';
import { ChatMarketInsights } from './components/comex/ChatMarketInsights';
import { ChatMarketMovers } from './components/comex/ChatMarketMovers';
import { SEO } from './components/SEO';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

// --- Types ---

type View = 'copilot' | 'marketplace' | 'insights' | 'quotes' | 'counterparties' | 'alerts' | 'matches' | 'sales' | 'buy-orders' | 'market';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: ComexResponse;
  agentOutput?: AgentOutput;
  toolResult?: ToolResult;
  operation?: Operation;
  roles?: Roles;
}

// --- Mock Data ---

const TAPE_DATA = [
  { name: 'Arabica Coffee C', price: '184.20', change: '+1.2%', up: true },
  { name: 'Robusta', price: '3,412', change: '-0.5%', up: false },
  { name: 'Black Pepper ASTA', price: '4,850', change: '+2.4%', up: true },
  { name: 'Cloves', price: '9,200', change: '0.0%', up: null },
  { name: 'Sesame', price: '1,750', change: '+0.8%', up: true },
  { name: 'Sugar #11', price: '22.45', change: '-1.1%', up: false },
  { name: 'Freight Asia-ME', price: '2,800', change: '+5.2%', up: true },
  { name: 'USD/BRL', price: '4.98', change: '-0.2%', up: false },
];

const CHART_DATA = [
  { date: 'Mar 15', price: 3800 },
  { date: 'Mar 16', price: 3850 },
  { date: 'Mar 17', price: 3780 },
  { date: 'Mar 18', price: 3900 },
  { date: 'Mar 19', price: 4050 },
  { date: 'Mar 20', price: 4000 },
  { date: 'Mar 21', price: 4120 },
];

// --- Components ---

const Sidebar = ({
  activeView,
  isDesktop,
  isOpen,
  isCollapsed,
  onClose,
  onToggleCollapse,
}: {
  activeView: string;
  isDesktop: boolean;
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}) => {
  const { user, logout, isPremium } = useAuth();
  const navigate = useNavigate();

  const menuItems = [
    { id: 'copilot', label: 'AI Trade Copilot', icon: MessageSquare, path: '/' },
    { id: 'market', label: 'Market Intelligence', icon: TrendingUp, path: '/market' },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag, path: '/marketplace' },
    { id: 'sales', label: 'Sales Records', icon: Package, path: '/sales' },
    { id: 'buy-orders', label: 'Buy Orders', icon: ShoppingCart, path: '/buy-orders' },
    { id: 'insights', label: 'Insights & Indices', icon: BarChart3, path: '/insights' },
    { id: 'alerts', label: 'Market Alerts', icon: Bell, path: '/alerts' },
    { id: 'quotes', label: 'Quotes & Docs', icon: FileText, path: '/quotes' },
    { id: 'counterparties', label: 'Counterparties', icon: Users, path: '/counterparties' },
  ];

  const shell = (
    <div
      className={cn(
        "bg-brand-primary text-white flex flex-col h-screen border-r border-brand-border transition-[width] duration-200",
        isDesktop ? (isCollapsed ? "w-20" : "w-64") : "w-64"
      )}
    >
      <div className={cn("p-6 flex items-center gap-3", isCollapsed && "justify-center")}> 
        <div className="relative w-10 h-10">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E099FF" />
                <stop offset="100%" stopColor="#8A3FFC" />
              </linearGradient>
            </defs>
            <circle cx="70" cy="55" r="22" fill="url(#logoGradient)" />
            <circle cx="35" cy="40" r="12" fill="url(#logoGradient)" />
            <circle cx="50" cy="60" r="10" fill="url(#logoGradient)" />
            <circle cx="25" cy="65" r="10" fill="url(#logoGradient)" />
            <path d="M35 40 Q42 50 50 60" stroke="url(#logoGradient)" strokeWidth="8" strokeLinecap="round" />
            <path d="M25 65 Q37 62 50 60" stroke="url(#logoGradient)" strokeWidth="8" strokeLinecap="round" />
          </svg>
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-none text-white">Comex</span>
            <span className="text-xl font-light tracking-tight leading-none text-brand-purple-light">Agent</span>
          </div>
        )}

        {isDesktop && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ml-auto p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/5 transition-colors",
              isCollapsed && "ml-0"
            )}
          >
            <ChevronRight size={18} className={cn("transition-transform", isCollapsed ? "rotate-180" : "")}/>
          </button>
        )}
      </div>

      <div className="px-4 mb-6">
        <button 
          onClick={() => navigate('/')}
          aria-label="New Trade Query"
          className={cn(
            "w-full bg-white/5 hover:bg-white/10 transition-colors rounded-xl py-3 px-4 flex items-center gap-3 text-sm font-medium border border-white/5",
            isCollapsed && "justify-center px-0"
          )}
        >
          <Plus size={18} className="text-brand-accent" />
          {!isCollapsed && "New Trade Query"}
        </button>
      </div>

      <nav className="flex-1 px-2 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            onClick={() => {
              if (!isDesktop) onClose();
            }}
            aria-label={item.label}
            title={isCollapsed ? item.label : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
              isCollapsed && "justify-center px-0",
              activeView === item.id 
                ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20 shadow-lg shadow-brand-accent/5" 
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            )}
          >
            <item.icon size={20} />
            {!isCollapsed && item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-brand-border space-y-2">
        {!isPremium ? (
          <button 
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-paywall'));
            }}
            aria-label="Upgrade to Premium"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white bg-brand-accent/20 hover:bg-brand-accent/30 transition-all border border-brand-accent/30",
              isCollapsed && "justify-center px-0"
            )}
          >
            <Zap size={20} className="text-brand-accent" />
            {!isCollapsed && "Upgrade to Premium"}
          </button>
        ) : null}
        <button 
          onClick={() => logout()}
          aria-label="Logout"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-400/5 transition-all",
            isCollapsed && "justify-center px-0"
          )}
        >
          <LogOut size={20} />
          {!isCollapsed && "Logout"}
        </button>
        {!isCollapsed && (
          <div className="mt-4 flex items-center gap-3 px-4 py-2">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center text-xs font-bold uppercase">
                {user?.displayName?.charAt(0) || 'U'}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.displayName || 'User'}</p>
              {!isPremium && (
                <p className="text-[10px] text-neutral-500 truncate uppercase tracking-widest font-bold">
                  Free Plan
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[90] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="absolute inset-y-0 left-0"
            >
              {shell}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  return shell;
};

const MarketTape = () => {
  return (
    <div className="h-12 bg-brand-surface border-b border-brand-border overflow-hidden flex items-center relative z-10">
      <div className="flex whitespace-nowrap animate-scroll">
        {[...TAPE_DATA, ...TAPE_DATA].map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-6 border-r border-brand-border">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{item.name}</span>
            <span className="text-sm font-mono font-medium text-white">{item.price}</span>
            <span className={cn(
              "text-xs font-bold flex items-center",
              item.up === true ? "text-emerald-400" : item.up === false ? "text-rose-400" : "text-neutral-500"
            )}>
              {item.up === true && <ArrowUpRight size={12} />}
              {item.up === false && <ArrowDownRight size={12} />}
              {item.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopBar = ({
  title,
  setView,
  onToggleSidebar,
  isSidebarOpen,
}: {
  title: string;
  setView: (v: View) => void;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}) => {
  const { isPremium } = useAuth();

  const triggerAI = (message: string) => {
    setView('copilot');
    // Small delay to ensure ChatWorkspace is mounted
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('trigger-ai', { detail: { message } }));
    }, 100);
  };

  return (
    <header className="h-16 bg-brand-surface border-b border-brand-border px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          className="lg:hidden p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <div className="h-4 w-[1px] bg-brand-border" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
          <input 
            type="text" 
            placeholder="Search commodities, counterparties, or documents..." 
            className="pl-10 pr-4 py-2 bg-brand-primary border border-brand-border rounded-full text-sm w-44 sm:w-64 lg:w-80 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white transition-all text-neutral-200"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                triggerAI((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="p-2 text-neutral-400 hover:bg-neutral-800 rounded-full transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full border-2 border-brand-surface" />
        </button>
        <button 
          onClick={() => triggerAI("I want to post a new sell offer")}
          className="bg-brand-surface border border-brand-border text-neutral-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus size={16} />
          Post Offer
        </button>
        <button 
          onClick={() => triggerAI("I have a general question about commodities trading")}
          className="bg-brand-accent text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-brand-purple-dark transition-colors flex items-center gap-2 shadow-sm"
        >
          <Zap size={16} />
          Ask AI
        </button>
      </div>
    </header>
  );
};

const ChatWorkspace = ({ onStartChat }: { onStartChat: () => void }) => {
  const { isPremium, user, refreshSubscription } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [marketData, setMarketData] = useState<MarketCoffeeLatest | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleSetInput = (e: any) => {
      setInput(e.detail.message);
    };
    window.addEventListener('set-input', handleSetInput);
    return () => window.removeEventListener('set-input', handleSetInput);
  }, []);

  // Load messages from localStorage
  useEffect(() => {
    const userId = user?.uid || 'anonymous';
    const saved = localStorage.getItem(`chat_history_${userId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch (e) {
        console.error('Failed to parse chat history:', e);
      }
    }
  }, [user?.uid]);

  // Save messages to localStorage
  useEffect(() => {
    const userId = user?.uid || 'anonymous';
    if (messages.length > 0) {
      localStorage.setItem(`chat_history_${userId}`, JSON.stringify(messages));
    }
  }, [messages, user?.uid]);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const data = await coreDataApi.getMarketCoffeeLatest();
        setMarketData(data);
      } catch (err) {
        console.error('Failed to fetch market data:', err);
      }
    };
    fetchMarketData();
  }, []);

  useEffect(() => {
    const handleOpenPaywall = () => {
      if (!isPremium) {
        setIsPaywallOpen(true);
      }
    };
    window.addEventListener('open-paywall', handleOpenPaywall);
    return () => window.removeEventListener('open-paywall', handleOpenPaywall);
  }, [isPremium]);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      const runRefresh = async () => {
        setIsRefreshing(true);
        const sessionId = searchParams.get('session_id');
        if (sessionId && user?.uid) {
          try {
            const idToken = await user.getIdToken();
            await fetch('/api/subscription/sync', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
              body: JSON.stringify({ firebaseUID: user.uid, sessionId }),
            });
          } catch (err) {
            console.error('Subscription sync error:', err);
          }
        }
        // Refresh subscription state immediately (includes polling)
        await refreshSubscription();
        setIsRefreshing(false);

        const successMsg: Message = {
          id: 'payment-success',
          role: 'assistant',
          content: "### 🎉 Welcome to Premium!\n\nYour account has been successfully upgraded. You now have unlimited access to **Comex Agent**. How can I help you with your trades today?",
          timestamp: new Date()
        };
        setMessages(prev => [successMsg, ...prev]);
        
        // Clear the param
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('payment');
        newParams.delete('session_id');
        setSearchParams(newParams, { replace: true });
      };

      runRefresh();
    }
  }, [searchParams, setSearchParams, refreshSubscription]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = window.innerHeight / 2;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [input]);

  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput || input;
    if (!text.trim() || isLoading) return;

    if (!isPremium) {
      setIsRefreshing(true);
      try {
        const premium = await refreshSubscription();
        if (!premium) {
          setIsPaywallOpen(true);
          return;
        }
      } finally {
        setIsRefreshing(false);
      }
    }

    if (messages && messages.length === 0) {
      onStartChat();
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const data = await comexApi.request({
        request_id: requestId,
        user_id: user?.uid || 'anonymous',
        user_message: text,
        context: marketData ? { market_context: marketData.latest } : {}
      });
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.agent_output?.output_text || "I'm sorry, I couldn't process that request right now.",
        timestamp: new Date(),
        metadata: data,
        agentOutput: data.agent_output,
        toolResult: data.tool_result,
        operation: data.operation,
        roles: data.roles
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error('Chat API Error:', err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting to the trade engine. Please try again in a moment.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleTriggerAI = (e: any) => {
      if (e.detail && e.detail.message) {
        handleSend(e.detail.message);
      }
    };
    window.addEventListener('trigger-ai', handleTriggerAI);
    return () => window.removeEventListener('trigger-ai', handleTriggerAI);
  }, [handleSend]);

  return (
    <div className="flex-1 flex flex-col bg-brand-primary relative overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
        <AnimatePresence>
          {isRefreshing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-brand-primary/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8"
            >
              <div className="w-16 h-16 border-4 border-brand-accent border-t-transparent rounded-full animate-spin mb-6" />
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Verifying Subscription...</h2>
              <p className="text-neutral-400 max-w-xs">We're syncing your account with Stripe. This usually takes a few seconds.</p>
            </motion.div>
          )}

          {messages && messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              transition={{ duration: 0.4 }}
              className="max-w-4xl mx-auto w-full"
            >
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-4 bg-white rounded-full" />
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Market Intelligence</h3>
              </div>
              <NewsCards />
            </motion.div>
          )}
        </AnimatePresence>
        {messages && messages.map((msg) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id} 
            className={cn(
              "flex gap-4 max-w-4xl w-full",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              msg.role === 'assistant' ? "bg-brand-surface text-white border border-brand-border" : "bg-neutral-800 text-neutral-400"
            )}>
              {msg.role === 'assistant' ? <Zap size={16} /> : <Users size={16} />}
            </div>
            <div className={cn(
              "p-5 rounded-2xl text-sm leading-relaxed shadow-lg border w-full",
              msg.role === 'assistant' 
                ? "bg-brand-surface border-brand-border text-neutral-200" 
                : "bg-neutral-800 border-neutral-700 text-white font-medium"
            )}>
              <div className="markdown-body prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>
                  {msg.role === 'assistant' && msg.operation?.status === 'success' && msg.content.startsWith('SUCCESS:') 
                    ? '' 
                    : msg.content}
                </ReactMarkdown>
              </div>

              {msg.role === 'assistant' && (
                <>
                  <ChatMarketInsights rawText={msg.content} />
                  <ChatMarketMovers rawText={msg.content} />
                  {msg.operation && <OperationEnvelope operation={msg.operation} />}
                  {msg.roles && <RolesPanel roles={msg.roles} />}
                </>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-4 max-w-4xl">
            <div className="w-8 h-8 rounded-lg bg-brand-surface text-white border border-brand-border flex items-center justify-center animate-pulse">
              <Zap size={16} />
            </div>
            <div className="p-5 rounded-2xl bg-brand-surface border border-brand-border flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-brand-primary via-brand-primary to-transparent">
        <div className="max-w-4xl mx-auto relative">
          <div className="mb-4 flex justify-center">
            <MarketContextBadge marketData={marketData} />
          </div>
          <div className="absolute left-4 bottom-4 flex items-center gap-2">
            <button className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors">
              <Paperclip size={18} />
            </button>
          </div>
          <textarea 
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything about trade opportunities, margins, or counterparties..." 
            className="w-full pl-14 pr-24 py-4 bg-brand-surface border border-brand-border rounded-2xl shadow-2xl focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white transition-all text-sm text-neutral-200 resize-none overflow-y-auto min-h-[56px]"
            style={{ maxHeight: '50vh' }}
          />
          <div className="absolute right-3 bottom-4">
            <button 
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="bg-brand-accent text-white p-2 rounded-xl hover:bg-brand-purple-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto mt-3 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {[
            { label: "Sell order", text: "Create a sale offer: Sell 2 containers of coffee FOB Santos at USD 3,800 per MT to Jordan." },
            { label: "Sell order (complete)", text: "Create a sale offer: Sell coffee — 2 containers — Incoterm FOB — Origin Santos, Brazil — Destination Aqaba, Jordan — Price USD 3,800/MT — Ready date 2026-04-05." },
            { label: "Buy offer", text: "Create a buy order: Buy 2 containers of coffee, target price USD 3,900 per MT, delivery to Jordan." },
            { label: "Buy offer (complete)", text: "Create a buy order: Buy coffee — 2 containers — Destination Aqaba, Jordan — Target price USD 3,900/MT — Needed by 2026-04-20." },
            { label: "Market Insights", text: "Market Insights" }
          ].map((hint) => (
            <button 
              key={hint.label}
              onClick={() => {
                setInput(hint.text);
                textareaRef.current?.focus();
              }}
              className="whitespace-nowrap px-3 py-1.5 bg-brand-surface hover:bg-neutral-800 text-neutral-400 rounded-full text-xs font-medium transition-colors border border-brand-border"
            >
              {hint.label}
            </button>
          ))}
        </div>
      </div>

      <PaywallModal isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} />
    </div>
  );
};

const AlertsView = ({ triggerAI }: { triggerAI: (m: string) => void }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);
      try {
        const data = await marketplaceApi.getAlerts();
        setAlerts(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-brand-primary">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-8">Market Alerts</h2>
        
        <div className="space-y-4">
          {alerts.map((alert, i) => (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={i}
              className="bg-brand-surface border border-brand-border p-6 rounded-2xl flex gap-6 items-start hover:border-white/20 transition-all cursor-pointer group"
              onClick={() => triggerAI(`Tell me more about the alert: ${alert.title}`)}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                alert.type === 'price' ? "bg-emerald-500/10 text-emerald-400" : 
                alert.type === 'risk' ? "bg-rose-500/10 text-rose-400" : "bg-blue-500/10 text-blue-400"
              )}>
                {alert.type === 'price' ? <TrendingUp size={24} /> : 
                 alert.type === 'risk' ? <AlertTriangle size={24} /> : <Bell size={24} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-white group-hover:text-emerald-400 transition-colors">{alert.title}</h3>
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{alert.time || 'Recently'}</span>
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed mb-3">{alert.description}</p>
                <div className="flex gap-2">
                  {alert.tags?.map((tag: string) => (
                    <span key={tag} className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="self-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={20} className="text-neutral-500" />
              </div>
            </motion.div>
          ))}
          {alerts.length === 0 && (
            <div className="py-20 text-center text-neutral-500 border border-dashed border-brand-border rounded-2xl">
              No active alerts at this time.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MatchesView = ({ saleId, triggerAI }: { saleId: string | null, triggerAI: (m: string) => void }) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [explanation, setExplanation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!saleId) return;
    const fetchMatches = async () => {
      setLoading(true);
      try {
        const [m, e] = await Promise.all([
          marketplaceApi.getMatches(saleId),
          marketplaceApi.explainMatches(saleId)
        ]);
        setMatches(m);
        setExplanation(e);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [saleId]);

  if (!saleId) return (
    <div className="flex-1 flex items-center justify-center text-neutral-500">
      Select a sale from the marketplace to see matches.
    </div>
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-brand-primary">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Market Matches</h2>
            <p className="text-neutral-500 text-sm">AI-powered matching for Sale ID: {saleId}</p>
          </div>
        </div>

        {explanation && (
          <div className="bg-brand-surface border border-brand-border p-6 rounded-2xl mb-8">
            <div className="flex items-center gap-2 mb-4 text-emerald-400">
              <Zap size={18} />
              <h3 className="font-bold uppercase tracking-wider text-xs">AI Match Analysis</h3>
            </div>
            <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
              <ReactMarkdown>{explanation.explanation || explanation.message || "No explanation available."}</ReactMarkdown>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matches.map((match, i) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={i}
              className="bg-brand-surface border border-brand-border p-6 rounded-2xl hover:border-white/20 transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white">
                  <Users size={20} />
                </div>
                <div className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold uppercase">
                  {Math.round((match.score || 0.85) * 100)}% Match
                </div>
              </div>
              <h3 className="font-bold text-white mb-1">{match.buyerName || 'Counterparty'}</h3>
              <p className="text-xs text-neutral-500 mb-4">{match.commodity} • {match.origin}</p>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold">
                  <span className="text-neutral-500">Volume</span>
                  <span className="text-neutral-200">{match.volume} {match.unit}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold">
                  <span className="text-neutral-500">Target Price</span>
                  <span className="text-neutral-200">${match.targetPrice}</span>
                </div>
              </div>

              <button 
                onClick={() => triggerAI(`I want to initiate a negotiation with ${match.buyerName} for the ${match.commodity} match.`)}
                className="w-full bg-white text-black py-2 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all"
              >
                Initiate Negotiation
              </button>
            </motion.div>
          ))}
          {matches.length === 0 && (
            <div className="col-span-full py-20 text-center text-neutral-500 border border-dashed border-brand-border rounded-2xl">
              No active matches found for this sale.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MarketplaceView = ({ setView, onSelectSale }: { setView: (v: View) => void, onSelectSale: (id: string) => void }) => {
  const [tab, setTab] = useState<'buy' | 'sell'>('sell');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const triggerAI = (message: string) => {
    setView('copilot');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('trigger-ai', { detail: { message } }));
    }, 100);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (tab === 'sell') {
          const data = await coreDataApi.getSales();
          setItems(data);
        } else {
          const data = await coreDataApi.getBuyOrders();
          setItems(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tab]);

  return (
    <div className="flex-1 bg-brand-primary p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Marketplace</h2>
            <p className="text-neutral-400 text-sm">Discover and manage global trade opportunities.</p>
          </div>
          <div className="flex bg-brand-surface p-1 rounded-xl border border-brand-border shadow-lg">
            <button 
              onClick={() => setTab('sell')}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-medium transition-all",
                tab === 'sell' ? "bg-brand-accent text-white shadow-md" : "text-neutral-400 hover:text-neutral-200"
              )}
            >
              Sell Offers
            </button>
            <button 
              onClick={() => setTab('buy')}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-medium transition-all",
                tab === 'buy' ? "bg-brand-accent text-white shadow-md" : "text-neutral-400 hover:text-neutral-200"
              )}
            >
              Buy Requests
            </button>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
            <input 
              type="text" 
              placeholder="Filter by commodity, origin, or specs..." 
              className="w-full pl-10 pr-4 py-2.5 bg-brand-surface border border-brand-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-neutral-200"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-brand-surface border border-brand-border rounded-xl text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-all">
            <Filter size={18} />
            Filters
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-brand-surface rounded-2xl border border-brand-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items && items.map((item) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={item?._id} 
                className="bg-brand-surface rounded-2xl border border-brand-border p-6 hover:shadow-2xl hover:border-white/30 transition-all group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-neutral-800 rounded-lg group-hover:bg-white/10 transition-colors">
                    <Package className="text-neutral-500 group-hover:text-white" size={24} />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-bold text-white">
                      ${tab === 'sell' ? (item?.price?.toLocaleString() || '0') : (item?.targetPrice?.toLocaleString() || '0')}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                      {tab === 'sell' ? item?.incoterm : 'Target Price'}
                    </span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-1 capitalize tracking-tight">{item?.commodity}</h3>
                <div className="flex items-center gap-2 text-neutral-400 text-xs mb-5">
                  <div className="flex items-center gap-1 bg-neutral-800 px-2 py-0.5 rounded-md">
                    <MapPin size={10} />
                    <span>{item?.origin || 'Global'}</span>
                  </div>
                  <ChevronRight size={12} className="text-neutral-600" />
                  <div className="flex items-center gap-1 bg-neutral-800 px-2 py-0.5 rounded-md">
                    <Globe size={10} />
                    <span>{item?.destination || 'Anywhere'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-brand-primary p-2 rounded-xl border border-brand-border">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Volume</p>
                    <p className="text-xs font-bold text-neutral-300">{item?.volume}</p>
                  </div>
                  <div className="bg-brand-primary p-2 rounded-xl border border-brand-border">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold mb-1">Reliability</p>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <div key={s} className={cn("w-2 h-1 rounded-full", s <= 4 ? "bg-white" : "bg-neutral-700")} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerAI(`I want to draft a quote for the ${item?.commodity} ${tab === 'sell' ? 'offer' : 'request'} from ${item?.origin || 'Global'}`);
                    }}
                    className="flex-1 bg-white text-black py-2 rounded-xl text-xs font-bold hover:bg-neutral-200 transition-all"
                  >
                    Draft Quote
                  </button>
                  {tab === 'sell' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSale(item._id);
                      }}
                      className="px-3 py-2 border border-brand-border rounded-xl hover:bg-neutral-800 transition-all text-neutral-500 hover:text-white flex items-center gap-1"
                    >
                      <TrendingUp size={14} />
                      <span className="text-[10px] font-bold">Matches</span>
                    </button>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerAI(`Analyze this ${item?.commodity} ${tab === 'sell' ? 'offer' : 'request'} and suggest a counter-offer strategy.`);
                    }}
                    className="px-3 py-2 border border-brand-border rounded-xl hover:bg-neutral-800 transition-all text-neutral-500 hover:text-white"
                  >
                    <Zap size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const InsightsPanel = () => {
  const [marketData, setMarketData] = useState<MarketCoffeeLatest | null>(null);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const data = await coreDataApi.getMarketCoffeeLatest();
        setMarketData(data);
      } catch (err) {
        console.error('Failed to fetch market data for insights:', err);
      }
    };
    fetchMarketData();
  }, []);

  return (
    <div className="hidden xl:flex w-80 bg-brand-surface border-l border-brand-border flex-col h-screen overflow-y-auto p-6 space-y-8">
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-white" />
          Market Snapshot
        </h3>
        <div className="bg-brand-primary rounded-2xl p-4 border border-brand-border">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs text-neutral-500 font-medium">Coffee Index (C)</p>
              <p className="text-xl font-bold text-white">184.20</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-0.5">
                <ArrowUpRight size={12} />
                +1.2%
              </span>
            </div>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={CHART_DATA}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="price" stroke="#ffffff" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Trade Signals</h3>
        <div className="space-y-3">
          {[
            { label: 'Freight Pressure', status: 'High', color: 'text-rose-400', bg: 'bg-rose-500/10' },
            { label: 'Margin Outlook', status: 'Positive', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Demand Momentum', status: 'Stable', color: 'text-blue-400', bg: 'bg-blue-500/10' },
          ].map((signal) => (
            <div key={signal.label} className={cn("p-3 rounded-xl border border-brand-border flex justify-between items-center", signal.bg)}>
              <span className="text-xs font-semibold text-neutral-300">{signal.label}</span>
              <span className={cn("text-xs font-bold", signal.color)}>{signal.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {[
            { user: 'Jordan Importer', action: 'Requested Quote', time: '2m ago', icon: Clock },
            { user: 'Santos Exporter', action: 'Updated Offer', time: '15m ago', icon: Zap },
            { user: 'System', action: 'New Match Found', time: '1h ago', icon: CheckCircle2 },
          ].map((activity, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500">
                <activity.icon size={14} />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-200">{activity.user}</p>
                <p className="text-[10px] text-neutral-500">{activity.action} • {activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-brand-border">
        <div className="bg-brand-surface p-4 rounded-2xl text-white border border-brand-border relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-xs font-bold text-neutral-500 mb-1 uppercase tracking-widest">Market Insight</p>
            <p className="text-xs leading-relaxed font-medium">
              Coffee margins for Jordan routes are up 4.2% this week due to lower freight costs from Santos.
            </p>
          </div>
          <Zap className="absolute -right-4 -bottom-4 text-white/5" size={80} />
        </div>
      </div>
    </div>
  );
};

const NewsCards = () => {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const data = await marketplaceApi.getNews();
        setNews(data.slice(0, 4));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, []);

  if (loading) {
    return (
      <div className="px-8 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-brand-surface rounded-xl border border-brand-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (!news || news.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {news && news.map((item, i) => {
        const title = (item?.title || '').toLowerCase();
        const isCoffee = title.includes('coffee');
        const isPepper = title.includes('pepper');
        
        return (
          <motion.a
            href={item?.link}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i}
            className="bg-brand-surface border border-brand-border p-4 rounded-xl hover:border-white/30 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", isCoffee || isPepper ? "bg-white" : "bg-neutral-600")} />
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    {isCoffee ? 'Coffee Insight' : isPepper ? 'Pepper Insight' : 'Market News'}
                  </span>
                </div>
                {(isCoffee || isPepper) && (
                  <div className="px-1.5 py-0.5 bg-white/10 rounded text-[8px] font-bold text-white uppercase tracking-tighter">
                    Priority
                  </div>
                )}
              </div>
              <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-brand-accent transition-colors">
                {item?.title}
              </h4>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-neutral-600">
                {item?.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Recent'}
              </span>
              <ArrowUpRight size={12} className="text-neutral-600 group-hover:text-white transition-colors" />
            </div>
          </motion.a>
        );
      })}
    </div>
  );
};

// --- Main App ---

const Footer = () => {
  return (
    <footer className="bg-brand-primary border-t border-brand-border py-12 px-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="text-white" size={20} />
            <span className="font-bold text-white tracking-tighter">COMEXAGENT</span>
          </div>
          <p className="text-neutral-500 text-xs leading-relaxed">
            The world's first AI-powered trade copilot for global commodity markets.
          </p>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-widest">Platform</h4>
          <ul className="space-y-2">
            <li><Link to="/market" className="text-neutral-500 hover:text-white text-xs transition-colors">Market Feed</Link></li>
            <li><Link to="/marketplace" className="text-neutral-500 hover:text-white text-xs transition-colors">Marketplace</Link></li>
            <li><Link to="/insights" className="text-neutral-500 hover:text-white text-xs transition-colors">Insights</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-widest">Resources</h4>
          <ul className="space-y-2">
            <li><Link to="/" className="text-neutral-500 hover:text-white text-xs transition-colors">AI Copilot</Link></li>
            <li><Link to="/alerts" className="text-neutral-500 hover:text-white text-xs transition-colors">Trade Alerts</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-widest">Legal</h4>
          <ul className="space-y-2">
            <li><a href="#" className="text-neutral-500 hover:text-white text-xs transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="text-neutral-500 hover:text-white text-xs transition-colors">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-brand-border flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-neutral-600 text-[10px] uppercase tracking-widest font-bold">
          © 2026 COMEXAGENT. ALL RIGHTS RESERVED.
        </p>
        <div className="flex gap-6">
          <a href="#" className="text-neutral-600 hover:text-white transition-colors"><Globe size={16} /></a>
          <a href="#" className="text-neutral-600 hover:text-white transition-colors"><Shield size={16} /></a>
          <a href="#" className="text-neutral-600 hover:text-white transition-colors"><Info size={16} /></a>
        </div>
      </div>
    </footer>
  );
};

const MarketView = lazy(() => import('./components/comex/MarketView').then(m => ({ default: m.MarketView })));
const SalesList = lazy(() => import('./components/comex/SalesList').then(m => ({ default: m.SalesList })));
const BuyOrdersList = lazy(() => import('./components/comex/BuyOrdersList').then(m => ({ default: m.BuyOrdersList })));
const InsightsDashboard = lazy(() => import('./components/comex/InsightsDashboard').then(m => ({ default: m.InsightsDashboard })));

function MainContent() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');

    const apply = (matches: boolean) => {
      setIsDesktop(matches);
      setSidebarOpen(matches);
      if (!matches) setSidebarCollapsed(false);
    };

    apply(mql.matches);

    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    if ('addEventListener' in mql) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    (mql as any).addListener(onChange);
    return () => (mql as any).removeListener(onChange);
  }, []);

  // Derive active view from path
  const activeView = location.pathname === '/' ? 'copilot' : location.pathname.slice(1).split('/')[0];

  const triggerAI = (message: string) => {
    navigate('/');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('trigger-ai', { detail: { message } }));
    }, 100);
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Initializing Comex Agent...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-black">
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar
          activeView={activeView}
          isDesktop={isDesktop}
          isOpen={isDesktop || sidebarOpen}
          isCollapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
        
        <main className="flex-1 flex flex-col min-w-0">
          <MarketTape />
          <TopBar 
            title={activeView === 'copilot' ? 'AI Trade Copilot' : activeView.charAt(0).toUpperCase() + activeView.slice(1)} 
            setView={(v) => navigate(v === 'copilot' ? '/' : `/${v}`)}
            onToggleSidebar={() => {
              if (isDesktop) {
                setSidebarCollapsed((v) => !v);
                return;
              }
              setSidebarOpen((v) => !v);
            }}
            isSidebarOpen={sidebarOpen}
          />
          
          <div className="flex-1 flex overflow-hidden">
            <Suspense fallback={
              <div className="flex-1 flex items-center justify-center bg-brand-primary">
                <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
              </div>
            }>
              <Routes>
                <Route path="/" element={
                  <>
                    <SEO 
                      title="AI Trade Copilot | COMEXAGENT" 
                      description="Negotiate global trade deals with AI. Get real-time commodity insights and draft professional quotes instantly."
                    />
                    <ChatWorkspace onStartChat={() => setHasStartedChat(true)} />
                  </>
                } />
                <Route path="/market" element={
                  <div className="flex-1 p-8 overflow-y-auto bg-brand-primary">
                    <SEO 
                      title="Global Market Feed | COMEXAGENT" 
                      description="Real-time global trade feed. Track coffee, pepper, and other commodity movements across the world."
                    />
                    <MarketView />
                  </div>
                } />
                <Route path="/marketplace" element={
                  <>
                    <SEO 
                      title="Commodity Marketplace | COMEXAGENT" 
                      description="Browse global sell offers and buy requests. Find your next trade opportunity in our verified marketplace."
                    />
                    <MarketplaceView 
                      setView={(v) => navigate(`/${v}`)} 
                      onSelectSale={(id) => {
                        setSelectedSaleId(id);
                        navigate('/matches');
                      }} 
                    />
                  </>
                } />
                <Route path="/matches" element={
                  <>
                    <SEO title="Trade Matches | COMEXAGENT" />
                    <MatchesView 
                      saleId={selectedSaleId} 
                      triggerAI={triggerAI}
                    />
                  </>
                } />
                <Route path="/alerts" element={
                  <>
                    <SEO title="Trade Alerts | COMEXAGENT" />
                    <AlertsView triggerAI={triggerAI} />
                  </>
                } />
                <Route path="/insights" element={
                  <div className="flex-1 p-8 overflow-y-auto bg-brand-primary">
                    <SEO 
                      title="Market Insights & Indices | COMEXAGENT" 
                      description="Advanced commodity analytics and price indices. Track Brazilian Green Coffee and other global benchmarks."
                    />
                    <InsightsDashboard />
                  </div>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            
            {((activeView === 'copilot' && !hasStartedChat) || activeView === 'marketplace') && <InsightsPanel />}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
