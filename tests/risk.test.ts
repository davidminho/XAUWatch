import assert from "node:assert/strict";
import test from "node:test";
import { calculateXauRisk } from "../lib/risk";

test("risk calculator sizes XAUUSD lot and computes R multiples", () => {
  const result = calculateXauRisk({ balance: 10_000, riskPercent: 0.5, entry: 4040, stopLoss: 4035, takeProfit: [4045, 4050, 4055] });
  assert.equal(result.valid, true);
  assert.equal(result.riskAmount, 50);
  assert.equal(result.lotSize, 0.1);
  assert.equal(result.estimatedLoss, 50);
  assert.deepEqual(result.rewardRisk, [1, 2, 3]);
});

test("risk calculator floors to broker lot step and flags high risk", () => {
  const result = calculateXauRisk({ balance: 2_000, riskPercent: 2, entry: 4040, stopLoss: 4033, takeProfit: [4047, 4054, 4061] });
  assert.equal(result.lotSize, 0.05);
  assert.equal(result.warning, "Risk มากกว่า 1% ต่อแผน");
  assert.ok(result.estimatedLoss <= result.riskAmount);
});
