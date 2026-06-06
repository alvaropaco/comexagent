import axios from "axios";
import {
  ComexResponse,
  MarketCoffeeLatest,
  Sale,
  BuyOrder,
  CoffeeLevel4,
  CommodityMovers,
  ChartSeries,
  MarketTimeframe,
  MarketTick,
  MarketIndex,
} from "../types/comex";

const api = axios.create({
  baseURL: "/api",
  timeout: 60000,
});

// Add interceptor for robust error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.response?.data || error.message;
    throw new Error(message);
  }
);

export const comexApi = {
  request: async (params: {
    request_id: string;
    user_id: string;
    user_message: string;
    idempotency_key?: string;
    context?: any;
  }): Promise<ComexResponse> => {
    const response = await api.post('/chat', params, {
      headers: {
        'x-request-id': params.request_id,
      },
    });
    return response.data;
  },
};

export const coreDataApi = {
  getMarketCoffeeLatest: async (): Promise<MarketCoffeeLatest> => {
    const response = await api.get<{ success: boolean; data: MarketCoffeeLatest }>('/market/coffee/latest');
    return response.data.data;
  },
  getCoffeeLevel4: async (): Promise<CoffeeLevel4> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; data: CoffeeLevel4 } }>('/market/yahoo/chart/coffee/level4');
    const inner = response.data.data;
    if (!inner?.ok) {
      throw new Error("Failed to fetch coffee level4");
    }
    return inner.data;
  },
  getCommodityMovers: async (): Promise<CommodityMovers> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; data: CommodityMovers } }>('/market/yahoo/movers/commodities');
    const inner = response.data.data;
    if (!inner?.ok) {
      throw new Error("Failed to fetch commodity movers");
    }
    return inner.data;
  },
  getChartSeries: async (params: { symbol?: string; interval?: string; range?: string } = {}): Promise<ChartSeries> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; data: ChartSeries } }>('/market/yahoo/chart/series', { params });
    const inner = response.data.data;
    if (!inner?.ok) {
      throw new Error("Failed to fetch chart series");
    }
    return inner.data;
  },
  getTickerTape: async (params: { timeframe?: MarketTimeframe; limit?: number } = {}): Promise<{ timeframe: MarketTimeframe; ticks: MarketTick[] }> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; timeframe: MarketTimeframe; ticks: MarketTick[] } }>(
      '/market/ticks/ticker-tape',
      { params },
    );
    const inner = response.data.data;
    if (!inner?.ok) throw new Error("Failed to fetch ticker tape");
    return { timeframe: inner.timeframe, ticks: inner.ticks || [] };
  },
  getMarketChart: async (params: { symbol?: string; timeframe?: MarketTimeframe; limit?: number } = {}): Promise<{ symbol: string; timeframe: MarketTimeframe; ticks: MarketTick[] }> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; symbol: string; timeframe: MarketTimeframe; ticks: MarketTick[] } }>(
      '/market/ticks/chart',
      { params },
    );
    const inner = response.data.data;
    if (!inner?.ok) throw new Error("Failed to fetch market chart");
    return { symbol: inner.symbol, timeframe: inner.timeframe, ticks: inner.ticks || [] };
  },
  getMarketIndexes: async (params: { symbol?: string; timeframe?: MarketTimeframe; limit?: number } = {}): Promise<{ symbol: string; timeframe: MarketTimeframe; indexes: MarketIndex[] }> => {
    const response = await api.get<{ success: boolean; data: { ok: boolean; symbol: string; timeframe: MarketTimeframe; indexes: MarketIndex[] } }>(
      '/market/indexes',
      { params },
    );
    const inner = response.data.data;
    if (!inner?.ok) throw new Error("Failed to fetch market indexes");
    return { symbol: inner.symbol, timeframe: inner.timeframe, indexes: inner.indexes || [] };
  },
  getSales: async (): Promise<Sale[]> => {
    const response = await api.get<{ success: boolean; data: Sale[] }>('/sales');
    return response.data.data || [];
  },
  getBuyOrders: async (): Promise<BuyOrder[]> => {
    const response = await api.get<{ success: boolean; data: BuyOrder[] }>('/buy-orders');
    return response.data.data || [];
  },
};

export interface Match {
  sale: Sale;
  buyOrder: BuyOrder;
  score: number;
}

export interface MatchExplanation {
  sale: Sale;
  matches: {
    buyOrder: BuyOrder;
    score: number;
    reasoning: string;
    pros: string[];
    cons: string[];
  }[];
}

export const marketplaceApi = {
  getMatches: async (saleId: string) => {
    const res = await api.get<{ success: boolean; data: Match[] }>("/matches", {
      params: { saleId },
    });
    return res.data.data || [];
  },
  explainMatches: async (saleId: string) => {
    const res = await api.get<{ success: boolean; data: any }>("/matches/explain", {
      params: { saleId },
    });
    return res.data.data || res.data || {};
  },
  getAlerts: async () => {
    const res = await api.get<{ success: boolean; data: any[] }>("/alerts");
    return res.data.data || [];
  },
  vectorSearch: async (query: string, k = 5, type?: "sale" | "buy-order") => {
    const res = await api.post<{ success: boolean; data: any[] }>("/vector/search", {
      query,
      k,
      filter: type ? { "metadata.type": type } : undefined,
    });
    return res.data.data || [];
  },
  getNews: async () => {
    const res = await api.get<any[]>("/news");
    return Array.isArray(res.data) ? res.data : [];
  },
};
