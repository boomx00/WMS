import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, users, roles, locations } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

export type DriverActivityCategory = "INBOUND" | "OUTBOUND" | "OTHER";

// Categorization is purely spatial — based on source/destination location
// types, not the raw event `type` column:
//   INBOUND  = Floor -> Rack
//   OUTBOUND = Rack or Floor -> Outbound WH  (i.e. picking)
//   OTHER    = anything else (rack-to-rack moves / "perpindahan lokasi",
//              adjustments, ship, etc.)
export function classifyDriverEvent(
  sourceType: string | null,
  destType: string | null
): DriverActivityCategory {
  if (sourceType === "FLOOR" && destType === "RACK") return "INBOUND";
  if ((sourceType === "RACK" || sourceType === "FLOOR") && destType === "OUTBOUND_WH") return "OUTBOUND";
  return "OTHER";
}

// GET /api/analytics/driver-activity?start=...&end=...
//
// Per-driver (role = "Forklift Driver") summary of location_stock_events
// activity in a date range, using location_stock as the source of truth
// for movement data (v2). Every Forklift Driver is included even with
// zero activity in range, so gaps are visible rather than hidden.
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

  const drivers = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(roles.name, "Forklift Driver"));

  if (drivers.length === 0) {
    return NextResponse.json([]);
  }

  const driverIds = drivers.map((d) => d.id);

  const events = await db
    .select({
      userId: locationStockEvents.userId,
      quantity: locationStockEvents.quantity,
      sourceType: sourceLoc.type,
      destType: destLoc.type,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .where(
      and(
        inArray(locationStockEvents.userId, driverIds),
        gte(locationStockEvents.createdAt, start),
        lte(locationStockEvents.createdAt, end)
      )
    );

  type Row = {
    userId: number;
    username: string;
    inboundCount: number;
    inboundQty: number;
    outboundCount: number;
    outboundQty: number;
    otherCount: number;
    otherQty: number;
    lastActivityAt: string | null;
  };

  const summary = new Map<number, Row>();
  for (const driver of drivers) {
    summary.set(driver.id, {
      userId: driver.id,
      username: driver.username,
      inboundCount: 0,
      inboundQty: 0,
      outboundCount: 0,
      outboundQty: 0,
      otherCount: 0,
      otherQty: 0,
      lastActivityAt: null,
    });
  }

  for (const ev of events) {
    const row = summary.get(ev.userId);
    if (!row) continue;

    const category = classifyDriverEvent(ev.sourceType, ev.destType);
    const qty = Math.abs(ev.quantity);

    if (category === "INBOUND") {
      row.inboundCount += 1;
      row.inboundQty += qty;
    } else if (category === "OUTBOUND") {
      row.outboundCount += 1;
      row.outboundQty += qty;
    } else {
      row.otherCount += 1;
      row.otherQty += qty;
    }

    const createdAtIso = ev.createdAt.toISOString();
    if (!row.lastActivityAt || createdAtIso > row.lastActivityAt) {
      row.lastActivityAt = createdAtIso;
    }
  }

  const rows = Array.from(summary.values())
    .map((r) => ({ ...r, totalCount: r.inboundCount + r.outboundCount + r.otherCount }))
    .sort((a, b) => b.totalCount - a.totalCount);

  return NextResponse.json(rows);
}