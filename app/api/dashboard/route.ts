import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { isValidDateParam } from "@/lib/officeDay";

export const dynamic = "force-dynamic";

// GET /api/dashboard?date=YYYY-MM-DD
//
// What came in and went out during one office day — from the office hour
// on Settings (default 07:00 WIB) to the same time the next day. Without
// `date`, the office day running right now (so at 04:00 that's still
// yesterday's shift, up to now). See lib/dashboard.ts.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  if (dateParam && !isValidDateParam(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  return NextResponse.json(await getDashboardData(dateParam));
}
