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
import { eq, and, gte, lt, sql, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatUtcDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// GET /api/total-stock/:sku/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Per-SKU movement ledger for the Total Stock page's Details modal.
// Deliberately does NOT reconstruct history from before this ledger
// existed: the first time this is called for a given item, it stamps an
// "opening balance" anchor (current total quantity, right now) in
// item_ledger_anchors. `from`/`to` only narrow which slice of the ledger
// is *displayed* — they never move the anchor. A `from` earlier than the
// anchor is clamped to it (`truncated: true` in the response).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const fromParam = parseDateParam(req.nextUrl.searchParams.get("from"));
  const toParam = parseDateParam(req.nextUrl.searchParams.get("to"));
  const toExclusive = toParam ? new Date(toParam.getTime() + 24 * 60 * 60 * 1000) : null;

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

  const truncated = Boolean(fromParam && fromParam < anchor.openingAt);
  const effectiveFrom = fromParam && fromParam > anchor.openingAt ? fromParam : anchor.openingAt;

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
      createdAtRaw: locationStockEvents.createdAt,
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
        gte(locationStockEvents.createdAt, anchor.openingAt),
        toExclusive ? lt(locationStockEvents.createdAt, toExclusive) : undefined
      )
    )
    .orderBy(asc(locationStockEvents.createdAt), asc(locationStockEvents.id));

  // Same total-effect rule as before: dest-only = entering (+quantity),
  // source-only = leaving (-quantity), both or neither = no net change.
  // Events before effectiveFrom still walk the running balance forward,
  // they just fold into the opening balance instead of being listed.
  let running = anchor.openingQuantity;
  let openingBalance = anchor.openingQuantity;
  const entries: {
    id: number;
    type: string;
    quantity: number;
    sourceCode: string | null;
    destinationCode: string | null;
    soNumber: string | null;
    tambahanNumber: string | null;
    username: string;
    createdAt: string;
    delta: number;
    runningTotal: number;
  }[] = [];

  for (const ev of events) {
    const hasSource = ev.sourceCode != null;
    const hasDest = ev.destinationCode != null;
    const delta = hasSource && hasDest ? 0 : hasDest ? ev.quantity : hasSource ? -ev.quantity : 0;
    running += delta;

    if (ev.createdAtRaw < effectiveFrom) {
      openingBalance = running;
    } else {
      const { createdAtRaw, ...rest } = ev;
      entries.push({ ...rest, delta, runningTotal: running });
    }
  }

  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    anchorOpeningQuantity: anchor.openingQuantity,
    anchorOpeningAt: openingAtFormatted,
    truncated,
    rangeFrom: fromParam ? formatUtcDateTime(effectiveFrom) : openingAtFormatted,
    rangeTo: toParam ? formatUtcDateTime(toParam) : null,
    openingBalance,
    closingBalance: running,
    entries,
  });
}