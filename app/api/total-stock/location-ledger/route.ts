import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locationStock, locationStockEvents, locations, users, salesOrders, tambahanOrders } from "@/db/schema";
import { eq, and, or, gte, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isUnpick, UNPICK_TYPE } from "@/lib/unpick";
import { getLedgerStartAt, parseDateParam, formatLocalDateTime, locationDelta, movesStock } from "@/lib/ledger";
export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

// GET /api/total-stock/location-ledger?location=A1.1&sku=SKU-123&from=&to=
//
// Ledger scoped to ONE location. `sku` narrows it to a single item at that
// location (the usual case, opened from a location row under a SKU); left
// blank, it aggregates every item that's passed through that location.
//
// Deliberately a separate endpoint from the per-SKU ledger: the WHERE
// clause shape is different (source/destination location match, not
// item_id alone), so it wants different indexes — see the migration in
// the previous message.
export async function GET(req: NextRequest) {
  const locationCode = req.nextUrl.searchParams.get("location")?.trim() ?? "";
  const sku = req.nextUrl.searchParams.get("sku")?.trim() ?? "";
  const fromParam = parseDateParam(req.nextUrl.searchParams.get("from"));
  const toParam = parseDateParam(req.nextUrl.searchParams.get("to"));
  const toExclusive = toParam ? new Date(toParam.getTime() + 24 * 60 * 60 * 1000) : null;
  const ledgerStartAt = await getLedgerStartAt();

  if (!locationCode) {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  let item: { id: number; sku: string; name: string } | null = null;
  if (sku) {
    const [found] = await db.select().from(items).where(eq(items.sku, sku));
    if (!found) {
      return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
    }
    item = found;
  }

  const [totalRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int` })
    .from(locationStock)
    .where(
      item
        ? and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id))
        : eq(locationStock.locationId, location.id)
    );
  const liveTotal = totalRow?.total ?? 0;

  const events = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      itemSku: items.sku,
      itemName: items.name,
      sourceLocationId: locationStockEvents.sourceLocationId,
      destinationLocationId: locationStockEvents.destinationLocationId,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: sql<string | null>`coalesce(${salesOrders.soNumber}, ${locationStockEvents.deletedSoNumber})`,
      tambahanNumber: tambahanOrders.tambahanNumber,
      username: users.username,
      createdAtRaw: locationStockEvents.createdAt,
      createdAt: sql<string>`to_char(${locationStockEvents.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(
      and(
        or(
          eq(locationStockEvents.sourceLocationId, location.id),
          eq(locationStockEvents.destinationLocationId, location.id)
        ),
        item ? eq(locationStockEvents.itemId, item.id) : undefined,
        gte(locationStockEvents.createdAt, ledgerStartAt)
      )
    )
    .orderBy(asc(locationStockEvents.createdAt), asc(locationStockEvents.id));

  // RELEASE is listed (Δ 0) but doesn't change the balance.
  const netSinceStart = events.reduce(
    (sum, ev) =>
      movesStock(ev.type)
        ? sum + locationDelta(location.id, ev.sourceLocationId, ev.destinationLocationId, ev.quantity)
        : sum,
    0
  );
  const startBalance = liveTotal - netSinceStart;

  const truncated = Boolean(fromParam && fromParam < ledgerStartAt);
  const effectiveFrom = fromParam && fromParam > ledgerStartAt ? fromParam : ledgerStartAt;

  let running = startBalance;
  let openingBalance = startBalance;
  const entries: {
    id: number;
    type: string;
    quantity: number;
    itemSku: string;
    itemName: string;
    direction: "IN" | "OUT" | null;
    otherLocationCode: string | null;
    soNumber: string | null;
    tambahanNumber: string | null;
    username: string;
    createdAt: string;
    delta: number;
    runningTotal: number;
  }[] = [];

  for (const ev of events) {
    const isIn = ev.destinationLocationId === location.id;
    const isOut = ev.sourceLocationId === location.id;
    const delta = movesStock(ev.type) ? (isIn ? ev.quantity : 0) - (isOut ? ev.quantity : 0) : 0;
    running += delta;

    if (ev.createdAtRaw < effectiveFrom) {
      openingBalance = running;
    } else if (!toExclusive || ev.createdAtRaw < toExclusive) {
      // Un-picks are stored reversed (lib/unpick.ts): show them as the move
      // that physically happened, so IN / OUT matches the delta.
      const unpick = isUnpick(ev.type, ev.quantity);
      entries.push({
        id: ev.id,
        type: unpick ? UNPICK_TYPE : ev.type,
        quantity: unpick ? -ev.quantity : ev.quantity,
        itemSku: ev.itemSku,
        itemName: ev.itemName,
        direction: unpick ? (isIn ? "OUT" : isOut ? "IN" : null) : isIn ? "IN" : isOut ? "OUT" : null,
        otherLocationCode: isIn ? ev.sourceCode : isOut ? ev.destinationCode : null,
        soNumber: ev.soNumber,
        tambahanNumber: ev.tambahanNumber,
        username: ev.username,
        createdAt: ev.createdAt,
        delta,
        runningTotal: running,
      });
    }
  }

  return NextResponse.json({
    locationCode: location.code,
    locationType: location.type,
    sku: item?.sku ?? null,
    name: item?.name ?? null,
    anchorOpeningQuantity: startBalance,
    anchorOpeningAt: formatLocalDateTime(ledgerStartAt),
    truncated,
    rangeFrom: formatLocalDateTime(effectiveFrom),
    rangeTo: toParam ? formatLocalDateTime(toParam) : null,
    openingBalance,
    closingBalance: running,
    entries,
  });
}