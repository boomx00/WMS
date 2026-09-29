import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { classifyDriverEvent, type DriverActivityCategory } from "../route";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

const CATEGORY_ORDER: DriverActivityCategory[] = ["INBOUND", "OUTBOUND", "OTHER"];

// GET /api/analytics/driver-activity/:userId?start=&end=
//
// One driver's events for a date range, grouped three levels deep:
//   1. Category (Inbound / Outbound / Other) — same spatial rule as the
//      summary endpoint.
//   2. Route (From -> To), sorted by destination. Multiple events along
//      the same From->To route are combined into a single line with a
//      summed quantity and count.
//   3. Individual transactions that made up a combined route — only
//      present (and only meaningful) when a route's count > 1.
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId: userIdParam } = await params;
  const userId = Number(userIdParam);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

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

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }

  const eventRows = await db
    .select({
      id: locationStockEvents.id,
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
    .where(
      and(
        eq(locationStockEvents.userId, userId),
        gte(locationStockEvents.createdAt, start),
        lte(locationStockEvents.createdAt, end)
      )
    );

  type EventItem = {
    id: number;
    itemSku: string;
    itemName: string;
    quantity: number;
    createdAt: Date;
  };
  type RouteGroup = {
    from: string;
    to: string;
    count: number;
    totalQty: number;
    events: EventItem[];
  };

  // category -> "from→to" -> route group
  const byCategory = new Map<DriverActivityCategory, Map<string, RouteGroup>>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, new Map());

  for (const ev of eventRows) {
    const category = classifyDriverEvent(ev.sourceType, ev.destType);
    const from = ev.sourceCode ?? "—";
    const to = ev.destCode ?? "—";
    const routeKey = `${from}→${to}`;

    const routes = byCategory.get(category)!;
    let route = routes.get(routeKey);
    if (!route) {
      route = { from, to, count: 0, totalQty: 0, events: [] };
      routes.set(routeKey, route);
    }
    route.count += 1;
    route.totalQty += Math.abs(ev.quantity);
    route.events.push({
      id: ev.id,
      itemSku: ev.itemSku,
      itemName: ev.itemName,
      quantity: ev.quantity,
      createdAt: ev.createdAt,
    });
  }

  const categories = CATEGORY_ORDER.map((category) => {
    const routes = Array.from(byCategory.get(category)!.values())
      .map((r) => ({ ...r, events: r.events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) }))
      .sort((a, b) => a.to.localeCompare(b.to));

    const count = routes.reduce((sum, r) => sum + r.count, 0);
    const totalQty = routes.reduce((sum, r) => sum + r.totalQty, 0);

    return { category, count, totalQty, routes };
  });

  return NextResponse.json({ username: user.username, categories });
}