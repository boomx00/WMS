import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, salesOrders } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// GET /api/analytics/sales-orders-shipped?start=...&end=...
//
// Which sales orders actually shipped out the door in a date range, and
// what left against each — i.e. location_stock_events rows with
// type "SHIP" that have a salesOrderId, grouped by SO. Distinct from
// /api/analytics/shipped-products, which groups the same underlying SHIP
// events by product instead of by order.
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
      salesOrderId: locationStockEvents.salesOrderId,
      soNumber: salesOrders.soNumber,
      orderDate: salesOrders.orderDate,
      itemId: locationStockEvents.itemId,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStockEvents.quantity,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .innerJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .where(
      and(
        eq(locationStockEvents.type, "SHIP"),
        gte(locationStockEvents.createdAt, start),
        lte(locationStockEvents.createdAt, end)
      )
    );

  type LineItem = {
    itemId: number;
    itemSku: string;
    itemName: string;
    quantity: number;
  };
  type OrderGroup = {
    salesOrderId: number;
    soNumber: string;
    orderDate: Date;
    lastShippedAt: Date;
    totalQuantity: number;
    lines: Map<number, LineItem>;
  };

  const byOrder = new Map<number, OrderGroup>();

  for (const ev of shipEvents) {
    if (ev.salesOrderId == null) continue;

    let order = byOrder.get(ev.salesOrderId);
    if (!order) {
      order = {
        salesOrderId: ev.salesOrderId,
        soNumber: ev.soNumber,
        orderDate: ev.orderDate,
        lastShippedAt: ev.createdAt,
        totalQuantity: 0,
        lines: new Map(),
      };
      byOrder.set(ev.salesOrderId, order);
    }

    const qty = Math.abs(ev.quantity);
    order.totalQuantity += qty;
    if (ev.createdAt > order.lastShippedAt) order.lastShippedAt = ev.createdAt;

    let line = order.lines.get(ev.itemId);
    if (!line) {
      line = { itemId: ev.itemId, itemSku: ev.itemSku, itemName: ev.itemName, quantity: 0 };
      order.lines.set(ev.itemId, line);
    }
    line.quantity += qty;
  }

  const salesOrdersOut = Array.from(byOrder.values())
    .map((o) => ({
      salesOrderId: o.salesOrderId,
      soNumber: o.soNumber,
      orderDate: o.orderDate,
      lastShippedAt: o.lastShippedAt,
      totalQuantity: o.totalQuantity,
      skuCount: o.lines.size,
      lines: Array.from(o.lines.values()).sort((a, b) => a.itemSku.localeCompare(b.itemSku)),
    }))
    .sort((a, b) => b.lastShippedAt.getTime() - a.lastShippedAt.getTime());

  const totalUnits = salesOrdersOut.reduce((sum, o) => sum + o.totalQuantity, 0);
  const totalSkus = new Set(shipEvents.map((e) => e.itemId)).size;

  return NextResponse.json({
    totalSalesOrders: salesOrdersOut.length,
    totalUnits,
    totalSkus,
    salesOrders: salesOrdersOut,
  });
}