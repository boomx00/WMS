import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items, locationStockEvents, salesOrders } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";

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

  // Every SO that's ever had any relevant event for this item — then
  // compute each one's TRUE net marked amount via the shared helper,
  // which correctly nets out SHIP.
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
    const quantity = await getPickedForSoQuantity(db, row.salesOrderId, item.id);
    if (quantity > 0) {
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