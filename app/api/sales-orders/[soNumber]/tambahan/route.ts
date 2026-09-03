import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, tambahanOrders, locationStockEvents, items } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// GET /api/sales-orders/:soNumber/tambahan
// Returns the Tambahan batch for this SO (if any) plus a per-SKU summary of
// what's been picked and shipped against it so far.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
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
    return NextResponse.json({ tambahan: null, items: [] });
  }

  const pickedRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      picked: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahan.id),
        inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING"])
      )
    )
    .groupBy(locationStockEvents.itemId);

  const shippedRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      shipped: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(and(eq(locationStockEvents.tambahanOrderId, tambahan.id), eq(locationStockEvents.type, "SHIP")))
    .groupBy(locationStockEvents.itemId);

  const shippedMap = new Map(shippedRows.map((r) => [r.itemId, r.shipped]));

  const itemIds = pickedRows.map((r) => r.itemId);
  const itemRows = itemIds.length
    ? await db.select().from(items).where(inArray(items.id, itemIds))
    : [];
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));

  const lines = pickedRows
    .filter((r) => r.picked > 0)
    .map((r) => {
      const item = itemMap.get(r.itemId);
      return {
        itemId: r.itemId,
        itemSku: item?.sku ?? "?",
        itemName: item?.name ?? "?",
        pickedQty: r.picked,
        shippedQty: shippedMap.get(r.itemId) ?? 0,
      };
    });

  return NextResponse.json({
    tambahan: {
      id: tambahan.id,
      tambahanNumber: tambahan.tambahanNumber,
      status: tambahan.status,
      convertedSalesOrderId: tambahan.convertedSalesOrderId,
      convertedAt: tambahan.convertedAt,
      createdAt: tambahan.createdAt,
    },
    items: lines,
  });
}

// POST /api/sales-orders/:soNumber/tambahan
// Creates the Tambahan batch for this SO if one doesn't already exist.
// Idempotent — returns the existing one if it's already there. The PDA
// pick endpoint also auto-creates this, so calling it explicitly first is
// optional.
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

  const [existing] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.parentSalesOrderId, salesOrder.id));

  if (existing) {
    if (existing.status === "CONVERTED") {
      return NextResponse.json(
        {
          error: `${existing.tambahanNumber} was already converted to a new SO — this SO can't start another Tambahan.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ tambahan: existing });
  }

  const [created] = await db
    .insert(tambahanOrders)
    .values({
      tambahanNumber: `TBH-${soNumber}`,
      parentSalesOrderId: salesOrder.id,
      createdBy: session.userId,
    })
    .returning();

  return NextResponse.json({ tambahan: created });
}