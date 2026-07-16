import { analysisJsonSchema, analysisSchema } from "./schema";
import type { Analysis, MarketSnapshot } from "./types";

const SYSTEM_PROMPT = `คุณเป็นนักวิเคราะห์ XAUUSD สำหรับ day trader ที่ปิดสถานะภายในวัน
เน้น M5-M15 โดยใช้ H1 ประกอบ แยก Bias ออกจาก Action เสมอ
ห้ามแนะนำให้ไล่ราคา ต้องมี trigger, entry zone, stop loss, TP 3 ระดับ และ invalidation
ถ้าข้อมูล stale หรือความได้เปรียบไม่ชัด ให้ action เป็น WAIT
ใช้ภาษาไทยกระชับ ไม่รับประกันผลตอบแทน และจำกัดความเสี่ยงไม่เกิน 0.5% ต่อแผน`;

function getOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  throw new Error("AI response did not contain structured output");
}

export async function createAiAnalysis(
  market: MarketSnapshot,
  userMessage: string,
  previousResponseId?: string
): Promise<Analysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
    reasoning: { effort: "low" },
    instructions: SYSTEM_PROMPT,
    input: `คำขอ: ${userMessage}\nMarket snapshot: ${JSON.stringify(market)}`,
    text: {
      format: {
        type: "json_schema",
        name: "xauusd_daytrade_analysis",
        strict: true,
        schema: analysisJsonSchema
      }
    }
  };
  if (previousResponseId) body.previous_response_id = previousResponseId;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object"
      ? (payload.error as { message?: string }).message
      : undefined;
    throw new Error(error || "OpenAI analysis failed");
  }

  const parsed = analysisSchema.parse(JSON.parse(getOutputText(payload)));
  return {
    ...parsed,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    source: "ai",
    responseId: typeof payload.id === "string" ? payload.id : undefined
  };
}
