import type { Candle, MarketSeries, MarketSnapshot, SymbolCode } from "./types";

const SYMBOLS: Record<SymbolCode, { provider: string; demoBase: number }> = {
  XAUUSD: { provider: process.env.TWELVE_DATA_XAU_SYMBOL || process.env.TWELVE_DATA_SYMBOL || "XAU/USD", demoBase: 4040.2 },
  BTCUSD: { provider: process.env.TWELVE_DATA_BTC_SYMBOL || "BTC/USD", demoBase: 65000 }
};

export function parseSymbol(value: unknown): SymbolCode {
  return value === "BTCUSD" ? "BTCUSD" : "XAUUSD";
}

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type TwelveDataBar = {
  datetime?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};

const asUtcIso = (value: unknown) => {
  if (typeof value !== "string") return null;
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const round = (value: number) => Math.round(value * 10) / 10;

export function createDemoCandles(now = new Date(), count = 96, symbol: SymbolCode = "XAUUSD"): Candle[] {
  const end = Math.floor(now.getTime() / 300_000) * 300_000;
  const bars: Candle[] = [];
  const config = SYMBOLS[symbol];
  const amplitude = symbol === "BTCUSD" ? 95 : 4.2;
  const slowAmplitude = symbol === "BTCUSD" ? 150 : 6.5;
  const driftScale = symbol === "BTCUSD" ? -0.8 : -0.035;
  let previousClose = config.demoBase;

  for (let index = 0; index < count; index += 1) {
    const wave = Math.sin(index / 5.7) * amplitude + Math.sin(index / 15) * slowAmplitude;
    const drift = (index - count / 2) * driftScale;
    const close = round(config.demoBase + wave + drift);
    const open = round(index === 0 ? close - amplitude * 0.2 : previousClose);
    const wick = amplitude * 0.26 + Math.abs(Math.sin(index * 1.7)) * amplitude * 0.42;
    bars.push({
      time: new Date(end - (count - 1 - index) * 300_000).toISOString(),
      open,
      high: round(Math.max(open, close) + wick),
      low: round(Math.min(open, close) - wick * 0.85),
      close
    });
    previousClose = close;
  }

  return bars;
}

async function getProviderCandles(symbol: SymbolCode): Promise<Candle[]> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return createDemoCandles(new Date(), 96, symbol);

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", SYMBOLS[symbol].provider);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "288");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", key);

  const response = await fetch(url, {
    next: { revalidate: 45 },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error("Market feed is unavailable");
  const data = (await response.json()) as Record<string, unknown>;
  if (data.status === "error") throw new Error(String(data.message || "Market feed error"));

  const values = Array.isArray(data.values) ? (data.values as TwelveDataBar[]) : [];
  const bars = values.flatMap((bar) => {
    const time = asUtcIso(bar.datetime);
    const open = asNumber(bar.open, 0);
    const high = asNumber(bar.high, 0);
    const low = asNumber(bar.low, 0);
    const close = asNumber(bar.close, 0);
    return time && open > 0 && high > 0 && low > 0 && close > 0
      ? [{ time, open, high, low, close }]
      : [];
  }).reverse();

  if (!bars.length) throw new Error(`Market feed returned no ${symbol} bars`);
  return bars;
}

export async function getMarketSeries(symbol: SymbolCode = "XAUUSD", limit = 96): Promise<MarketSeries> {
  const bars = await getProviderCandles(symbol);
  const selected = bars.slice(-Math.max(24, Math.min(limit, 288)));
  const asOf = selected.at(-1)?.time ?? new Date().toISOString();
  const source = process.env.TWELVE_DATA_API_KEY ? "twelve-data" : "demo";
  const stale = source === "demo" || Date.now() - new Date(asOf).getTime() > 12 * 60_000;
  return { symbol, interval: "5min", bars: selected, asOf, source, stale };
}

export async function getMarketSnapshot(symbol: SymbolCode = "XAUUSD", manualPrice?: number): Promise<MarketSnapshot> {
  const series = await getMarketSeries(symbol, 288);
  const bars = series.bars;
  const latest = bars.at(-1);
  if (!latest) throw new Error(`Market feed returned no ${symbol} bars`);

  const price = manualPrice ?? latest.close;
  const sessionBars = bars.slice(-288);
  const oldest = sessionBars[0] ?? latest;
  const sessionOpen = oldest.open;
  const highs = sessionBars.map((bar) => bar.high);
  const lows = sessionBars.map((bar) => bar.low);

  return {
    symbol,
    price,
    open: sessionOpen,
    high: Math.max(...highs),
    low: Math.min(...lows),
    changePercent: sessionOpen > 0 ? ((price - sessionOpen) / sessionOpen) * 100 : 0,
    asOf: series.asOf,
    source: series.source,
    stale: series.stale
  };
}
