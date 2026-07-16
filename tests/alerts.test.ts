import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanAlertRules, evaluatePlanAlerts } from "../lib/alerts";
import type { TradePlan } from "../lib/types";

const plan: TradePlan = { direction: "buy", entryZone: [4038, 4040], stopLoss: 4032, takeProfit: [4048, 4056, 4064], trigger: "test", invalidation: "test" };

test("alerts trigger only when price crosses into a level", () => {
  const rules = buildPlanAlertRules("plan-1", plan);
  const entry = evaluatePlanAlerts({ rules, previousPrice: 4042, price: 4039, lastTriggered: {}, now: 1_000_000 });
  assert.equal(entry.triggered.length, 1);
  assert.equal(entry.triggered[0]?.kind, "entry");

  const tp = evaluatePlanAlerts({ rules, previousPrice: 4047, price: 4048.2, lastTriggered: entry.lastTriggered, now: 1_010_000 });
  assert.equal(tp.triggered[0]?.label, "ราคาแตะ TP1");
});

test("alerts respect cooldown and do not fire while remaining inside a zone", () => {
  const rules = buildPlanAlertRules("plan-1", plan);
  const first = evaluatePlanAlerts({ rules, previousPrice: 4042, price: 4039, lastTriggered: {}, now: 1_000_000 });
  const stillInside = evaluatePlanAlerts({ rules, previousPrice: 4039, price: 4039.5, lastTriggered: first.lastTriggered, now: 1_001_000 });
  assert.equal(stillInside.triggered.length, 0);
  const reenteredDuringCooldown = evaluatePlanAlerts({ rules, previousPrice: 4042, price: 4039, lastTriggered: first.lastTriggered, now: 1_002_000 });
  assert.equal(reenteredDuringCooldown.triggered.length, 0);
});
