// client/src/lib/predictionApi.ts
// API wrappers for prediction market endpoints

import { apiRequest } from "./queryClient";

export interface GammaMarket {
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  endDate: string | null;
  closed: boolean;
  active: boolean;
  archived: boolean;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  yesTokenId: string;
  noTokenId: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
}

export interface OrderBook {
  market: string;
  asset_id: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: string;
  hash: string;
}

export interface PriceHistoryPoint {
  time: string;
  price: number;
}

export interface QuoteResponse {
  quoteId: string;
  conditionId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  shares: number;
  avgPrice: number;
  slippageBps: number;
  totalUsd: number;
  expiresAt: string;
}

export interface TradeResponse {
  tradeId: string;
  filledShares: number;
  avgPrice: number;
  slippageBps: number;
  totalUsd: number;
  newBalanceUsd: number;
  position: { shares: number; avgPrice: number } | null;
}

export interface PredictionPosition {
  id: string;
  conditionId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  shares: number;
  avgPrice: number;
  costBasisUsd: number;
  realizedPnlUsd: number;
  resolutionState: string | null;
  createdAt: string;
}

export interface PredictionTrade {
  id: string;
  conditionId: string;
  tokenId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  shares: number;
  avgPrice: number;
  slippageBps: number;
  totalUsd: number;
  createdAt: string;
}

export async function fetchMarkets(limit = 50, offset = 0): Promise<GammaMarket[]> {
  return apiRequest("GET", `/api/predictions/markets?limit=${limit}&offset=${offset}`);
}

export async function fetchMarketBySlug(slug: string): Promise<GammaMarket> {
  return apiRequest("GET", `/api/predictions/markets/${encodeURIComponent(slug)}`);
}

export async function fetchOrderBook(tokenId: string): Promise<OrderBook> {
  return apiRequest("GET", `/api/predictions/markets/${encodeURIComponent(tokenId)}/book`);
}

export async function fetchPriceHistory(
  tokenId: string,
  interval: "1h" | "6h" | "1d" | "1w" | "1m" | "max" = "1d"
): Promise<PriceHistoryPoint[]> {
  return apiRequest(
    "GET",
    `/api/predictions/markets/${encodeURIComponent(tokenId)}/history?interval=${interval}`
  );
}

export async function createQuote(body: {
  conditionId: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  shares?: number;
  notionalUsd?: number;
}): Promise<QuoteResponse> {
  return apiRequest("POST", "/api/predictions/quote", body);
}

export async function executeTrade(body: {
  quoteId: string;
  idempotencyKey?: string;
}): Promise<TradeResponse> {
  return apiRequest("POST", "/api/predictions/trade", body);
}

export interface PredictionBalance {
  balanceUsd: number;
  realizedPnlUsd: number;
}

export async function fetchBalance(): Promise<PredictionBalance> {
  return apiRequest("GET", "/api/predictions/me/balance");
}

export interface PredictionStats {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalVolumeUsd: number;
  avgTradeUsd: number;
  openPositionsCount: number;
}

export async function fetchStats(): Promise<PredictionStats> {
  return apiRequest("GET", "/api/predictions/me/stats");
}

export async function fetchPositions(): Promise<PredictionPosition[]> {
  return apiRequest("GET", "/api/predictions/me/positions");
}

export async function fetchTrades(limit = 50, offset = 0): Promise<PredictionTrade[]> {
  return apiRequest("GET", `/api/predictions/me/trades?limit=${limit}&offset=${offset}`);
}
