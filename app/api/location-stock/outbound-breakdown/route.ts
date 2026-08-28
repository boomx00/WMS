import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items, locationStockEvents, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getShippedQuantity } from "@/lib/shippedQuantity";

// An SO counts as "complete" if every one of its line items has fully
// shipped — once complete, its marked/leftover figures are no longer
// meaningful to show here regardless of any underlying historical drift.
async function isSalesOrderComplete(salesOrderId: number): Promise<boolean> {
  const lines = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrderId));

  if (lines.length === 0) return false;

  for (const line of lines) {
    const shipped = await getShippedQuantity(db, salesOrderId, line.itemId);
    if (shipped < line.quantity) return false;
  }
  return true;
}

// GET /api/location-stock/outbound-breakdown?sku=...
export async function GET(req: NextRequest) {
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const [stockRow] = await db
    .select({ quantity: locationStock.quantity })
    .from(locationStock)
    .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, item.id)));

  const totalInOutboundWh = stockRow?.quantity ?? 0;
  const unmarked = await getUnclaimedQuantity(db, item.id);

  const distinctSoRows = await db
    .selectDistinct({
      salesOrderId: locationStockEvents.salesOrderId,
      soNumber: salesOrders.soNumber,
    })
    .from(locationStockEvents)
    .innerJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .where(
      and(
        eq(locationStockEvents.itemId, item.id),
        isNotNull(locationStockEvents.salesOrderId)
      )
    );

  const markedBySo = [];
  for (const row of distinctSoRows) {
    if (row.salesOrderId === null) continue;

    // Skip completed SOs entirely — their marked figure is no longer
    // relevant to show, whatever it might compute to.
    const complete = await isSalesOrderComplete(row.salesOrderId);
    if (complete) continue;

    const quantity = await getPickedForSoQuantity(db, row.salesOrderId, item.id);
    if (quantity !== 0) {
      markedBySo.push({ salesOrderId: row.salesOrderId, soNumber: row.soNumber, quantity });
    }
  }

  return NextResponse.json({
    itemSku: item.sku,
    itemName: item.name,
    totalInOutboundWh,
    unmarked,
    markedBySo,
  });
}