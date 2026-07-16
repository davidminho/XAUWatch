import type { Action, MarketSnapshot, TradePlan } from "./types";

export const MARKET_DELAYED_AFTER_MS = 6 * 60_000;
export const MARKET_STALE_AFTER_MS = 12 * 60_000;
export const PLAN_TTL_MS = 30 * 60_000;

export type MarketFreshness = "LIVE" | "DELAYED" | "STALE" | "DEMO";
export type PlanPosition = "IN_ZONE" | "NEAR_ENTRY" | "TOO_LATE" | "INVALIDATED" | "WAIT";

export function marketAgeMs(snapshot: Pick<MarketSnapshot, "asOf">, now = Date.now()) {
  const timestamp = new Date(snapshot.asOf).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

export function deriveMarketFreshness(snapshot: MarketSnapshot, now = Date.now()): MarketFreshness {
  if (snapshot.source === "demo") return "DEMO";
  const age = marketAgeMs(snapshot, now);
  if (snapshot.stale || age > MARKET_STALE_AFTER_MS) return "STALE";
  if (age > MARKET_DELAYED_AFTER_MS) return "DELAYED";
  return "LIVE";
}

export function formatAgeThai(ageMs: number) {
  if (!Number.isFinite(ageMs)) return "ไม่ทราบเวลา";
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
}

export function isPlanExpired(generatedAt: string, now = Date.now(), ttlMs = PLAN_TTL_MS) {
  const generated = new Date(generatedAt).getTime();
  return !Number.isFinite(generated) || now - generated > ttlMs;
}

export function planRemainingMs(generatedAt: string, now = Date.now(), ttlMs = PLAN_TTL_MS) {
  const generated = new Date(generatedAt).getTime();
  return Number.isFinite(generated) ? Math.max(0, ttlMs - (now - generated)) : 0;
}

export function derivePlanPosition(price: number, plan: TradePlan): { position: PlanPosition; distance: number } {
  const [rawA, rawB] = plan.entryZone;
  const low = Math.min(rawA, rawB);
  const high = Math.max(rawA, rawB);
  const midpoint = (low + high) / 2;
  const stopDistance = Math.abs(midpoint - plan.stopLoss);
  const nearDistance = Math.max(stopDistance * 0.25, 2);

  if (plan.direction === "buy" && price <= plan.stopLoss) return { position: "INVALIDATED", distance: 0 };
  if (plan.direction === "sell" && price >= plan.stopLoss) return { position: "INVALIDATED", distance: 0 };
  if (plan.direction === "buy" && price >= plan.takeProfit[0]) return { position: "TOO_LATE", distance: Math.abs(price - plan.takeProfit[0]) };
  if (plan.direction === "sell" && price <= plan.takeProfit[0]) return { position: "TOO_LATE", distance: Math.abs(price - plan.takeProfit[0]) };
  if (price >= low && price <= high) return { position: "IN_ZONE", distance: 0 };

  const distance = price < low ? low - price : price - high;
  return { position: distance <= nearDistance ? "NEAR_ENTRY" : "WAIT", distance };
}

export function deriveSafeAction(
  action: Action,
  freshness: MarketFreshness,
  expired: boolean,
  position: PlanPosition
): Action {
  if (freshness !== "LIVE" || expired || position === "TOO_LATE" || position === "INVALIDATED") return "WAIT";
  return action;
}
