import type { NextRequest } from "next/server";

export function isAuthorized(request: NextRequest) {
  const expected = process.env.DASHBOARD_ACCESS_TOKEN;
  if (!expected) return true;
  const supplied = request.headers.get("x-dashboard-token");
  return supplied === expected;
}
