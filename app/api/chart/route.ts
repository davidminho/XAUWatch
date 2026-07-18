import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getMarketSeries, parseSymbol } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getMarketSeries(parseSymbol(request.nextUrl.searchParams.get("symbol")), 96));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chart feed failed" },
      { status: 503 }
    );
  }
}
