import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, tambahanOrders, locationStockEvents, items } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// POST /api/sales-orders/:soNumber/tambahan/confirm
//
// Confirms that shipping for this Tambahan batch is done: for every SKU
// that still has picked-but-unshipped stock (leftover from over-picking,
// e.g. picked 54 but only 48 actually got shipped), releases that
// leftover back to the general unmarked ("ecer") pool — same mechanism
// as the per-SKU correction on the Outbound WH breakdown, just applied
// across every item under this Tambahan in one action instead of one at
// a time. Purely a ledger reattribution; no physical stock moves.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.parentSalesOrderId, salesOrder.id));
  if (!tambahan) {
    return NextResponse.json({ error: "No Tambahan batch exists for this SO" }, { status: 404 });
  }

  const addRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahan.id),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')`
      )
    )
    .groupBy(locationStockEvents.itemId);

  const shipRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(and(eq(locationStockEvents.tambahanOrderId, tambahan.id), eq(locationStockEvents.type, "SHIP")))
    .groupBy(locationStockEvents.itemId);

  const shipByItem = new Map<number, number>(shipRows.map((r) => [r.itemId, r.total]));

  const releases: { itemId: number; outstanding: number }[] = [];
  for (const row of addRows) {
    const outstanding = row.total - (shipByItem.get(row.itemId) ?? 0);
    if (outstanding > 0) {
      releases.push({ itemId: row.itemId, outstanding });
    }
  }

  if (releases.length === 0) {
    return NextResponse.json({ released: [], message: "Nothing outstanding — every picked unit has already shipped." });
  }

  await db.insert(locationStockEvents).values(
    releases.map((r) => ({
      type: "CLAIM" as const,
      itemId: r.itemId,
      sourceLocationId: null,
      destinationLocationId: null,
      salesOrderId: null,
      tambahanOrderId: tambahan.id,
      quantity: -r.outstanding,
      userId: session.userId,
    }))
  );

  const itemIds = releases.map((r) => r.itemId);
  const itemRows = await db.select().from(items).where(inArray(items.id, itemIds));
  const skuById = new Map(itemRows.map((i) => [i.id, i.sku]));

  return NextResponse.json({
    released: releases.map((r) => ({ itemSku: skuById.get(r.itemId) ?? "?", quantity: r.outstanding })),
  });
}