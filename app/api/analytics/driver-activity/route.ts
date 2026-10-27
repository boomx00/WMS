import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, users, roles, locations, locationTypes } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { SUPER_ROLE_NAME } from "@/lib/roles";
import { alias } from "drizzle-orm/pg-core";
import { isUnpick } from "@/lib/unpick";
import { isOpenPickArea } from "@/lib/locationRules";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");
const sourceType = alias(locationTypes, "source_type");
const destType = alias(locationTypes, "dest_type");

export type DriverActivityCategory = "INBOUND" | "OUTBOUND" | "OTHER";

// What the classifier needs to know about each side of an event. Null
// when that side has no location (stock entering or leaving).
export type DriverEventSide = {
  pickable: boolean;
  hasPosition: boolean;
  isStaging: boolean;
};

export function driverSide(
  pickable: boolean | null,
  hasPosition: boolean | null,
  isStaging: boolean | null
): DriverEventSide | null {
  return pickable === null ? null : { pickable, hasPosition: !!hasPosition, isStaging: !!isStaging };
}

// Categorization is purely spatial — based on the source/destination
// locations' type rules and roles, not the raw event `type` column:
//   INBOUND  = open pick area (pickable, no rack position — Floor)
//              -> a location with a rack position (put-away)
//   OUTBOUND = any pickable location -> a staging location
//              (i.e. picking)
//   OTHER    = anything else (rack-to-rack moves / "perpindahan lokasi",
//              adjustments, ship, etc.)
export function classifyDriverEvent(
  source: DriverEventSide | null,
  dest: DriverEventSide | null
): DriverActivityCategory {
  if (source && isOpenPickArea(source) && dest?.hasPosition) return "INBOUND";
  if (source?.pickable && dest?.isStaging) return "OUTBOUND";
  return "OTHER";
}

// GET /api/analytics/driver-activity?start=...&end=...
//
// Per-driver (role = "Forklift Driver" or Manager) summary of
// location_stock_events activity in a date range, using location_stock as
// the source of truth for movement data (v2). Every matching user is
// included even with zero activity in range, so gaps are visible rather
// than hidden.
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
    .where(inArray(roles.name, ["Forklift Driver", SUPER_ROLE_NAME]));

  if (drivers.length === 0) {
    return NextResponse.json([]);
  }

  const driverIds = drivers.map((d) => d.id);

  const events = await db
    .select({
      userId: locationStockEvents.userId,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      sourcePickable: sourceType.pickable,
      sourceHasPosition: sourceType.hasPosition,
      sourceStaging: sourceLoc.isStaging,
      destPickable: destType.pickable,
      destHasPosition: destType.hasPosition,
      destStaging: destLoc.isStaging,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(sourceType, eq(sourceLoc.type, sourceType.code))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(destType, eq(destLoc.type, destType.code))
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

    // Un-picks are stored reversed (lib/unpick.ts): classify the move that
    // physically happened (staging → elsewhere).
    const unpick = isUnpick(ev.type, ev.quantity);
    const sourceSide = driverSide(ev.sourcePickable, ev.sourceHasPosition, ev.sourceStaging);
    const destSide = driverSide(ev.destPickable, ev.destHasPosition, ev.destStaging);
    const category = unpick ? classifyDriverEvent(destSide, sourceSide) : classifyDriverEvent(sourceSide, destSide);
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