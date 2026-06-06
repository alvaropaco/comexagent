export interface AgentAction {
  type: string;
  payload: any;
  confidence: number;
  validation_errors: string[];
}

export interface AgentOutput {
  intent: string;
  output_text: string;
  action: AgentAction;
}

export interface ToolResult {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  data?: any;
  idempotent_id?: string;
}

export interface Operation {
  status: 'success' | 'needs_input' | 'error';
  message: string;
  action_type: 'CREATE_SALE' | 'CREATE_BUY_ORDER' | 'NONE';
  created?: any;
  missing_fields?: string[];
}

export interface Roles {
  ops: string;
  pricing: string;
  risk: string;
}

export interface ComexResponse {
  agent_output: AgentOutput;
  tool_result: ToolResult;
  operation: Operation;
  route: string;
  roles?: Roles;
}

export type MarketSignalLine = {
  signal?: string;
  confidence?: string;
  score?: number;
  alignment1m?: string;
  alignment5m?: string;
  alignment1h?: string;
  volume?: string;
  reason?: string;
  risks?: string;
};

export type TickPoint = { price: number; timestamp: string };

export type CoffeeLevel4 = {
  ticks_1m: TickPoint[];
  ticks_5m: TickPoint[];
  ticks_1h: TickPoint[];
  volume: number;
  avgVolume: number;
  previousClose: number;
  high: number;
  low: number;
  price: number;
  currency: string;
  fetchedAt: string;
  timestamp?: string | null;
  symbol?: string;
  exchange?: string;
};

export type CommodityMover = {
  symbol: string;
  changePercent: number;
  currency: string | null;
  timestamp: string | null;
};

export type CommodityMovers = {
  fetchedAt: string;
  movers: CommodityMover[];
};

export type ChartSeries = {
  symbol: string;
  interval: string;
  range: string;
  currency: string | null;
  fetchedAt: string;
  series: TickPoint[];
};

export type MarketTimeframe = '1m' | '5m' | '1h';

export type MarketTick = {
  _id: string;
  commodity?: string;
  symbol: string;
  price: number;
  high?: number;
  low?: number;
  volume?: number;
  source: string;
  timeframe: MarketTimeframe;
  timestamp: string;
  ingestedAt: string;
};

export type MarketIndex = {
  _id: string;
  symbol: string;
  indexType: string;
  value: number;
  metadata?: Record<string, any>;
  timeframe: MarketTimeframe;
  computedAt: string;
  source: string;
};

export interface MarketCoffeeLatest {
  ok: boolean;
  latest: {
    sourceUrl: string;
    fetchedAt: string;
    memoText: string;
  };
}

export interface Sale {
  _id: string;
  commodity: string;
  incoterm: string;
  price: number;
  volume: string;
  origin: string;
  destination: string;
  createdAt: string;
}

export interface BuyOrder {
  _id: string;
  commodity: string;
  targetPrice: number;
  volume: string;
  destination: string;
  createdAt: string;
}
