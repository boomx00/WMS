import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// GET /api/analytics/shipped-products?start=...&end=...
//
// Per-product breakdown of everything that actually left the warehouse
// in a date range — i.e. location_stock_events rows with type "SHIP".
// This is distinct from Picking: Picking moves stock to Outbound WH,
// SHIP is the final leg out the door against a sales order.
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

  const shipEvents = await db
    .select({
      itemId: locationStockEvents.itemId,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStockEvents.quantity,
      salesOrderId: locationStockEvents.salesOrderId,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .where(
      and(
        eq(locationStockEvents.type, "SHIP"),
        gte(locationStockEvents.createdAt, start),
        lte(locationStockEvents.createdAt, end)
      )
    );

  type Row = {
    itemId: number;
    itemSku: string;
    itemName: string;
    totalQuantity: number;
    shipmentCount: number;
    orderIds: Set<number>;
  };

  const byItem = new Map<number, Row>();

  for (const ev of shipEvents) {
    let row = byItem.get(ev.itemId);
    if (!row) {
      row = {
        itemId: ev.itemId,
        itemSku: ev.itemSku,
        itemName: ev.itemName,
        totalQuantity: 0,
        shipmentCount: 0,
        orderIds: new Set(),
      };
      byItem.set(ev.itemId, row);
    }
    row.totalQuantity += Math.abs(ev.quantity);
    row.shipmentCount += 1;
    if (ev.salesOrderId != null) row.orderIds.add(ev.salesOrderId);
  }

  const products = Array.from(byItem.values())
    .map((r) => ({
      itemId: r.itemId,
      itemSku: r.itemSku,
      itemName: r.itemName,
      totalQuantity: r.totalQuantity,
      shipmentCount: r.shipmentCount,
      orderCount: r.orderIds.size,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  const totalQuantity = products.reduce((sum, p) => sum + p.totalQuantity, 0);
  const totalOrders = new Set(shipEvents.filter((e) => e.salesOrderId != null).map((e) => e.salesOrderId)).size;

  return NextResponse.json({
    totalQuantity,
    totalOrders,
    totalSkus: products.length,
    products,
  });
}