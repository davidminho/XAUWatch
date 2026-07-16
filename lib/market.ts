import type { MarketSnapshot } from "./types";

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function getMarketSnapshot(manualPrice?: number): Promise<MarketSnapshot> {
  const key = process.env.TWELVE_DATA_API_KEY;
  const now = new Date();

  if (!key) {
    const minuteWave = Math.sin(now.getMinutes() / 8) * 3.2;
    const price = manualPrice ?? Math.round((4040.2 + minuteWave) * 10) / 10;
    return {
      symbol: "XAUUSD",
      price,
      open: 4052.9,
      high: 4065.4,
      low: 4033.8,
      changePercent: Math.round(((price - 4052.9) / 4052.9) * 10000) / 100,
      asOf: now.toISOString(),
      source: "demo",
      stale: true
    };
  }

  const symbol = process.env.TWELVE_DATA_SYMBOL || "XAU/USD";
  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", key);

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Market feed is unavailable");
  const data = (await response.json()) as Record<string, unknown>;
  if (data.status === "error") throw new Error(String(data.message || "Market feed error"));

  const close = manualPrice ?? asNumber(data.close, 0);
  const asOf = typeof data.timestamp === "number"
    ? new Date(data.timestamp * 1000).toISOString()
    : now.toISOString();
  const stale = now.getTime() - new Date(asOf).getTime() > 5 * 60_000;

  return {
    symbol: "XAUUSD",
    price: close,
    open: asNumber(data.open, close),
    high: asNumber(data.high, close),
    low: asNumber(data.low, close),
    changePercent: asNumber(data.percent_change, 0),
    asOf,
    source: "twelve-data",
    stale
  };
}
