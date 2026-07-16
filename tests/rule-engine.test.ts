import assert from "node:assert/strict";
import test from "node:test";
import { createRuleAnalysis } from "../lib/rule-engine";
import { analysisSchema } from "../lib/schema";
import type { MarketSnapshot } from "../lib/types";

const base: MarketSnapshot = {
  symbol: "XAUUSD",
  price: 4040,
  open: 4053,
  high: 4065,
  low: 4034,
  changePercent: -0.32,
  asOf: new Date().toISOString(),
  source: "twelve-data",
  stale: false
};

test("rule engine creates a schema-valid bearish plan", () => {
  const result = createRuleAnalysis(base);
  assert.equal(result.bias, "SELL");
  assert.equal(result.primaryPlan.direction, "sell");
  assert.equal(result.primaryPlan.takeProfit.length, 3);
  assert.doesNotThrow(() => analysisSchema.parse(result));
});

test("stale market data always produces WAIT", () => {
  const result = createRuleAnalysis({ ...base, stale: true });
  assert.equal(result.action, "WAIT");
  assert.match(result.summary, /ข้อมูลตลาดยังไม่สด/);
});

test("bullish intraday structure creates a buy plan", () => {
  const result = createRuleAnalysis({ ...base, price: 4058, open: 4042, low: 4032, high: 4068 });
  assert.equal(result.bias, "BUY");
  assert.equal(result.primaryPlan.direction, "buy");
  assert.ok(result.primaryPlan.stopLoss < result.primaryPlan.entryZone[0]);
});
