import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users } from "@/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { classifyDriverEvent } from "../route";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

const PAGE_SIZE = 25;

// GET /api/analytics/driver-activity/:userId?start=&end=&page=
//
// Individual location_stock_events for one driver in a date range, most
// recent first, each tagged with the same Inbound/Picking/Other category
// the summary endpoint uses — so a driver's Details drill-down lines up
// exactly with their summary counts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId: userIdParam } = await params;
  const userId = Number(userIdParam);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

  const start = new Date(startParam);
  const end = new Date(endParam);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }

  const whereClause = and(
    eq(locationStockEvents.userId, userId),
    gte(locationStockEvents.createdAt, start),
    lte(locationStockEvents.createdAt, end)
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locationStockEvents)
    .where(whereClause);

  const eventRows = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      itemSku: items.sku,
      itemName: items.name,
      sourceCode: sourceLoc.code,
      sourceType: sourceLoc.type,
      destCode: destLoc.code,
      destType: destLoc.type,
      quantity: locationStockEvents.quantity,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .where(whereClause)
    .orderBy(desc(locationStockEvents.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const events = eventRows.map((ev) => ({
    id: ev.id,
    type: ev.type,
    category: classifyDriverEvent(ev.type, ev.sourceType, ev.destType),
    itemSku: ev.itemSku,
    itemName: ev.itemName,
    sourceCode: ev.sourceCode,
    destCode: ev.destCode,
    quantity: ev.quantity,
    createdAt: ev.createdAt,
  }));

  return NextResponse.json({
    username: user.username,
    page,
    totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    totalCount: count,
    events,
  });
}
