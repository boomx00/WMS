import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { palletEvents, items, pallets, locations, users } from "@/db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const currentLocation = alias(locations, "current_location");
const eventLocation = alias(locations, "event_location");

// GET /api/transactions/summary?start=2026-08-01&end=2026-08-09
export async function GET(req: NextRequest) {
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

  const start = new Date(`${startParam}T00:00:00`);
  const end = new Date(`${endParam}T23:59:59.999`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const inCondition = sql`(${palletEvents.type} = 'INBOUND' or (${palletEvents.type} = 'SPLIT' and ${pallets.splitFromPalletId} is not null))`;
const outCondition = sql`${palletEvents.type} in ('OUTBOUND', 'DEFAULT_OUTBOUND')`;
  const [totals] = await db
    .select({
      totalIn: sql<number>`coalesce(sum(case when ${inCondition} then ${palletEvents.quantity} else 0 end), 0)::int`,
      totalOut: sql<number>`coalesce(sum(case when ${outCondition} then ${palletEvents.quantity} else 0 end), 0)::int`,
      inboundCount: sql<number>`coalesce(sum(case when ${inCondition} then 1 else 0 end), 0)::int`,
      outboundCount: sql<number>`coalesce(sum(case when ${outCondition} then 1 else 0 end), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(and(gte(palletEvents.createdAt, start), lte(palletEvents.createdAt, end)));

  const bySku = await db
    .select({
      itemSku: items.sku,
      itemName: items.name,
      totalIn: sql<number>`coalesce(sum(case when ${inCondition} then ${palletEvents.quantity} else 0 end), 0)::int`,
      totalOut: sql<number>`coalesce(sum(case when ${outCondition} then ${palletEvents.quantity} else 0 end), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(items, eq(pallets.itemId, items.id))
    .where(and(gte(palletEvents.createdAt, start), lte(palletEvents.createdAt, end)))
    .groupBy(items.sku, items.name)
    .having(sql`sum(case when ${inCondition} or ${outCondition} then ${palletEvents.quantity} else 0 end) > 0`);

  // Activity list per SKU. MOVED is deliberately excluded — for INBOUND and
  // SPLIT (the "in" events), we show the pallet's CURRENT location instead
  // of where it originally landed, so an inbound-then-moved pallet reads as
  // one line with its final resting spot, not two separate lines.
  const rawEvents = await db
    .select({
      eventId: palletEvents.id,
      itemSku: items.sku,
      type: palletEvents.type,
      quantity: palletEvents.quantity,
      createdAt: palletEvents.createdAt,
      label: pallets.label,
      eventLocationCode: eventLocation.code,
      currentLocationCode: currentLocation.code,
      username: users.username,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(eventLocation, eq(palletEvents.locationId, eventLocation.id))
    .innerJoin(currentLocation, eq(pallets.locationId, currentLocation.id))
    .innerJoin(users, eq(palletEvents.userId, users.id))
    .where(
      and(
        gte(palletEvents.createdAt, start),
        lte(palletEvents.createdAt, end),
inArray(palletEvents.type, ["INBOUND", "SPLIT", "CONFIRMED", "OUTBOUND", "DEFAULT_OUTBOUND"])      )
    )
    .orderBy(palletEvents.createdAt);

  // For INBOUND/SPLIT rows, display the CURRENT location (final resting
  // spot) instead of the event's own location (where it first landed).
  const eventsFormatted = rawEvents.map((e) => ({
    eventId: e.eventId,
    itemSku: e.itemSku,
    type: e.type,
    quantity: e.quantity,
    createdAt: e.createdAt,
    label: e.label,
    username: e.username,
    locationCode:
      e.type === "INBOUND" || e.type === "SPLIT" ? e.currentLocationCode : e.eventLocationCode,
  }));

  const eventsBySku = new Map<string, typeof eventsFormatted>();
  for (const e of eventsFormatted) {
    if (!eventsBySku.has(e.itemSku)) eventsBySku.set(e.itemSku, []);
    eventsBySku.get(e.itemSku)!.push(e);
  }

  const bySkuWithEvents = bySku.map((row) => ({
    ...row,
    events: eventsBySku.get(row.itemSku) ?? [],
  }));

  return NextResponse.json({ totals, bySku: bySkuWithEvents });
}