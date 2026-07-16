import assert from "node:assert/strict";
import test from "node:test";
import { deriveMarketFreshness, derivePlanPosition, deriveSafeAction, isPlanExpired } from "../lib/market-status";
import type { MarketSnapshot, TradePlan } from "../lib/types";

const now = Date.parse("2026-07-16T07:00:00.000Z");
const market: MarketSnapshot = { symbol: "XAUUSD", price: 4040, open: 4038, high: 4050, low: 4030, changePercent: 0.1, asOf: new Date(now - 60_000).toISOString(), source: "twelve-data", stale: false };
const buyPlan: TradePlan = { direction: "buy", entryZone: [4038, 4040], stopLoss: 4032, takeProfit: [4048, 4056, 4064], trigger: "test", invalidation: "test" };

test("freshness distinguishes live, delayed, stale, and demo", () => {
  assert.equal(deriveMarketFreshness(market, now), "LIVE");
  assert.equal(deriveMarketFreshness({ ...market, asOf: new Date(now - 8 * 60_000).toISOString() }, now), "DELAYED");
  assert.equal(deriveMarketFreshness({ ...market, asOf: new Date(now - 13 * 60_000).toISOString() }, now), "STALE");
  assert.equal(deriveMarketFreshness({ ...market, source: "demo" }, now), "DEMO");
});

test("expired or unsafe plans force WAIT", () => {
  assert.equal(isPlanExpired(new Date(now - 31 * 60_000).toISOString(), now), true);
  assert.equal(deriveSafeAction("BUY_NOW", "DELAYED", false, "IN_ZONE"), "WAIT");
  assert.equal(deriveSafeAction("BUY_NOW", "LIVE", true, "IN_ZONE"), "WAIT");
  assert.equal(deriveSafeAction("BUY_NOW", "LIVE", false, "TOO_LATE"), "WAIT");
});

test("plan position detects entry, proximity, invalidation, and late chase", () => {
  assert.equal(derivePlanPosition(4039, buyPlan).position, "IN_ZONE");
  assert.equal(derivePlanPosition(4041.5, buyPlan).position, "NEAR_ENTRY");
  assert.equal(derivePlanPosition(4031, buyPlan).position, "INVALIDATED");
  assert.equal(derivePlanPosition(4049, buyPlan).position, "TOO_LATE");
});
