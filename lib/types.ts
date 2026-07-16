export type Direction = "BUY" | "SELL" | "NEUTRAL";
export type Action = "BUY_NOW" | "SELL_NOW" | "WAIT";
export type Trend = "bullish" | "bearish" | "neutral";

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MarketSeries = {
  symbol: "XAUUSD";
  interval: "5min";
  bars: Candle[];
  asOf: string;
  source: "twelve-data" | "demo";
  stale: boolean;
};

export type MarketSnapshot = {
  symbol: "XAUUSD";
  price: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  asOf: string;
  source: "twelve-data" | "demo";
  stale: boolean;
};

export type TradePlan = {
  direction: "buy" | "sell";
  entryZone: [number, number];
  trigger: string;
  stopLoss: number;
  takeProfit: [number, number, number];
  invalidation: string;
};

export type Analysis = {
  id: string;
  symbol: "XAUUSD";
  price: number;
  bias: Direction;
  action: Action;
  confidence: number;
  summary: string;
  trend: { m5: Trend; m15: Trend; h1: Trend };
  resistance: number[];
  support: number[];
  primaryPlan: TradePlan;
  riskNote: string;
  generatedAt: string;
  source: "ai" | "rule-engine";
  responseId?: string;
};
