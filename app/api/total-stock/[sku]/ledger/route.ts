import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  items,
  locationStock,
  locationStockEvents,
  locations,
  users,
  salesOrders,
  tambahanOrders,
  itemLedgerAnchors,
} from "@/db/schema";
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

// GET /api/total-stock/:sku/ledger
//
// Per-SKU movement ledger for the Total Stock page's Details view.
// Deliberately does NOT reconstruct history from before this ledger
// existed: the first time this is called for a given item, it stamps an
// "opening balance" anchor (current total quantity, right now) in
// item_ledger_anchors, and every call after that replays
// location_stock_events from that anchor forward. Everything before the
// anchor is assumed to already be reflected in the opening number.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  let [anchor] = await db
    .select()
    .from(itemLedgerAnchors)
    .where(eq(itemLedgerAnchors.itemId, item.id));

  if (!anchor) {
    const [totalRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int` })
      .from(locationStock)
      .where(eq(locationStock.itemId, item.id));

    // onConflictDoNothing guards against two concurrent first-views of the
    // same SKU racing to create the anchor — whichever insert wins, the
    // re-select below picks it up either way.
    await db
      .insert(itemLedgerAnchors)
      .values({ itemId: item.id, openingQuantity: totalRow?.total ?? 0 })
      .onConflictDoNothing({ target: itemLedgerAnchors.itemId });

    [anchor] = await db
      .select()
      .from(itemLedgerAnchors)
      .where(eq(itemLedgerAnchors.itemId, item.id));
  }

  const [{ openingAtFormatted }] = await db
    .select({
      openingAtFormatted: sql<string>`to_char(${itemLedgerAnchors.openingAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(itemLedgerAnchors)
    .where(eq(itemLedgerAnchors.itemId, item.id));

  const events = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: salesOrders.soNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
      username: users.username,
      createdAt: sql<string>`to_char(${locationStockEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(locationStockEvents)
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(
      and(
        eq(locationStockEvents.itemId, item.id),
        gte(locationStockEvents.createdAt, anchor.openingAt)
      )
    )
    .orderBy(asc(locationStockEvents.createdAt), asc(locationStockEvents.id));

  // Whether an event changes the SKU's *total* warehouse stock depends only
  // on which side of it is a real location vs "outside the building":
  //   dest only   -> stock entering the total   (+quantity) — INBOUND,
  //                  DEFAULT_INBOUND, OTHER_INBOUND, and ADJUSTMENT (whose
  //                  quantity is already a signed delta)
  //   source only -> stock leaving the total    (-quantity) — SHIP,
  //                  OTHER_OUTBOUND
  //   both set    -> internal move, total unchanged (0)     — MOVE, PICKING,
  //                  DEFAULT_MOVE, DEFAULT_PICKING
  //   neither set -> pure reclassification, unchanged (0)   — CLAIM, RELEASE
  let running = anchor.openingQuantity;
  const entries = events.map((ev) => {
    const hasSource = ev.sourceCode != null;
    const hasDest = ev.destinationCode != null;
    const delta = hasSource && hasDest ? 0 : hasDest ? ev.quantity : hasSource ? -ev.quantity : 0;
    running += delta;
    return { ...ev, delta, runningTotal: running };
  });

  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    openingQuantity: anchor.openingQuantity,
    openingAt: openingAtFormatted,
    currentTotal: running,
    entries,
  });
}