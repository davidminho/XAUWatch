import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { getMarketSnapshot } from "@/lib/market";
import { createAiAnalysis } from "@/lib/openai-analysis";
import { createRuleAnalysis } from "@/lib/rule-engine";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  manualPrice: z.number().positive().optional(),
  previousResponseId: z.string().max(200).optional(),
  chartImage: z.string()
    .max(4_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Invalid chart image")
    .optional(),
  chartTimeframe: z.enum(["M5", "M15", "H1", "AUTO"]).optional()
});

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = requestSchema.parse(await request.json());
    const market = await getMarketSnapshot(input.manualPrice);
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ analysis: createRuleAnalysis(market), market, fallback: true, chartUsed: false });
    }
    try {
      const analysis = await createAiAnalysis(market, input.message, input.previousResponseId, {
        imageDataUrl: input.chartImage,
        timeframe: input.chartTimeframe
      });
      return NextResponse.json({ analysis, market, fallback: false, chartUsed: Boolean(input.chartImage) });
    } catch (error) {
      return NextResponse.json({
        analysis: createRuleAnalysis(market),
        market,
        fallback: true,
        chartUsed: false,
        warning: error instanceof Error ? error.message : "AI fallback used"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
