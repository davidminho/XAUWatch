import assert from "node:assert/strict";
import test from "node:test";
import { chartAnalysisError, readApiPayload } from "../lib/api-response";

test("readApiPayload parses a JSON response", async () => {
  const payload = await readApiPayload<{ ok: boolean }>(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.equal(payload.ok, true);
});

test("readApiPayload explains an empty oversized request response", async () => {
  await assert.rejects(
    () => readApiPayload(new Response(null, { status: 413 })),
    /ครอปภาพ/
  );
});

test("chartAnalysisError preserves actionable API errors", () => {
  assert.equal(chartAnalysisError(new Error("บริการไม่พร้อม")), "บริการไม่พร้อม");
});
