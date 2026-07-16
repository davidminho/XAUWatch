import assert from "node:assert/strict";
import test from "node:test";
import { CHART_IMAGE_MAX_SOURCE_BYTES, validateChartImageMeta } from "../lib/chart-image";

test("chart image metadata accepts supported mobile screenshot formats", () => {
  assert.doesNotThrow(() => validateChartImageMeta("image/png", 2_000_000));
  assert.doesNotThrow(() => validateChartImageMeta("image/jpeg", 2_000_000));
  assert.doesNotThrow(() => validateChartImageMeta("image/webp", 2_000_000));
});

test("chart image metadata rejects unsupported or oversized input", () => {
  assert.throws(() => validateChartImageMeta("image/svg+xml", 1000), /PNG/);
  assert.throws(() => validateChartImageMeta("image/png", CHART_IMAGE_MAX_SOURCE_BYTES + 1), /12 MB/);
});
