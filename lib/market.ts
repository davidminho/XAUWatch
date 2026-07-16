import type { MarketSnapshot } from "./types";

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
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
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

  const bars = Array.isArray(data.values) ? (data.values as TwelveDataBar[]) : [];
  const latest = bars[0];
  if (!latest) throw new Error("Market feed returned no XAUUSD bars");

  const latestClose = asNumber(latest.close, 0);
  if (latestClose <= 0) throw new Error("Market feed returned an invalid XAUUSD price");

  const price = manualPrice ?? latestClose;
  const oldest = bars[bars.length - 1] ?? latest;
  const sessionOpen = asNumber(oldest.open, price);
  const highs = bars.map((bar) => asNumber(bar.high, price));
  const lows = bars.map((bar) => asNumber(bar.low, price));
  const asOf = asUtcIso(latest.datetime) ?? now.toISOString();
  // The latest completed 5-minute bar can be several minutes old while the
  // current bar is forming, so allow two full bars before marking data stale.
  const stale = now.getTime() - new Date(asOf).getTime() > 12 * 60_000;

  return {
    symbol: "XAUUSD",
    price,
    open: sessionOpen,
    high: Math.max(...highs),
    low: Math.min(...lows),
    changePercent: sessionOpen > 0 ? ((price - sessionOpen) / sessionOpen) * 100 : 0,
    asOf,
    source: "twelve-data",
    stale
  };
}
