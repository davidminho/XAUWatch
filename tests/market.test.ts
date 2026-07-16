import assert from "node:assert/strict";
import test from "node:test";
import { createDemoCandles } from "../lib/market";

test("demo candles are chronological and internally valid", () => {
  const bars = createDemoCandles(new Date("2026-07-16T08:00:00.000Z"), 48);
  assert.equal(bars.length, 48);
  assert.ok(bars.every((bar) => bar.high >= Math.max(bar.open, bar.close)));
  assert.ok(bars.every((bar) => bar.low <= Math.min(bar.open, bar.close)));
  assert.ok(bars.every((bar, index) => index === 0 || bar.time > bars[index - 1].time));
  assert.equal(new Date(bars.at(-1)?.time || 0).getUTCMinutes() % 5, 0);
});
