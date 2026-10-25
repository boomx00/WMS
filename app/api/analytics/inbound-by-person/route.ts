import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { palletEvents, users } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// GET /api/analytics/inbound-by-person?start=2026-08-01&end=2026-08-09
export async function GET(req: NextRequest) {
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

const start = new Date(startParam);
const end = new Date(endParam);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Count distinct pallets inbounded per person, plus total units.
  const rows = await db
    .select({
      username: users.username,
      palletCount: sql<number>`count(distinct ${palletEvents.palletId})::int`,
      totalUnits: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(users, eq(palletEvents.userId, users.id))
    .where(
      and(
        eq(palletEvents.type, "INBOUND"),
        gte(palletEvents.createdAt, start),
        lte(palletEvents.createdAt, end)
      )
    )
    .groupBy(users.username)
    .orderBy(sql`count(distinct ${palletEvents.palletId}) desc`);

  return NextResponse.json(rows);
}