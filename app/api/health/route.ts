import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    ai: Boolean(process.env.OPENAI_API_KEY),
    market: Boolean(process.env.TWELVE_DATA_API_KEY),
    protected: Boolean(process.env.DASHBOARD_ACCESS_TOKEN),
    checkedAt: new Date().toISOString()
  });
}
