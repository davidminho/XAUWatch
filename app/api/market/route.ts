import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getMarketSnapshot } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawPrice = request.nextUrl.searchParams.get("price");
  const manualPrice = rawPrice ? Number(rawPrice) : undefined;
  try {
    return NextResponse.json(await getMarketSnapshot(manualPrice));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Market feed failed" },
      { status: 503 }
    );
  }
}
