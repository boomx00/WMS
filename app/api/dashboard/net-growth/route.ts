import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { NET_GROWTH_MAX_DAYS, getNetGrowth } from "@/lib/dashboard";
import { isValidDateParam } from "@/lib/officeDay";

export const dynamic = "force-dynamic";

// GET /api/dashboard/net-growth?end=YYYY-MM-DD&days=30
//
// Inbound − outbound per office day for the `days` office days ending at
// `end` (default: the office day running now; a future `end` is clamped to
// it), plus the running total. See getNetGrowth in lib/dashboard.ts.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const end = params.get("end");
  if (end && !isValidDateParam(end)) {
    return NextResponse.json({ error: "end must be YYYY-MM-DD" }, { status: 400 });
  }

  const daysParam = params.get("days") ?? "30";
  const days = Number(daysParam);
  if (!Number.isInteger(days) || days < 1 || days > NET_GROWTH_MAX_DAYS) {
    return NextResponse.json({ error: `days must be a whole number from 1 to ${NET_GROWTH_MAX_DAYS}` }, { status: 400 });
  }

  return NextResponse.json(await getNetGrowth(end, days));
}
