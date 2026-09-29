import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, salesOrders } from "@/db/schema";
import { eq, and, gte, lte, isNotNull, inArray } from "drizzle-orm";

// GET /api/analytics/sales-orders-shipped?start=...&end=...
//
// Which sales orders were performed in a date range, and what left against
// each one. "Performed in the range" is driven by the SO's own
// truck_enter_time / truck_leave_time fields — not by SHIP event
// timestamps — since those are the fields that actually record when the
// order was worked (truck at the dock), independent of when individual
// SHIP events happen to have been logged.
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

  // truckEnterTime/truckLeaveTime are stored as plain (timezone-less)
  // strings, so compare against ISO strings rather than Date objects —
  // matches how the column is declared ({ mode: "string" }).
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const orders = await db
    .select({
      id: salesOrders.id,
      soNumber: salesOrders.soNumber,
      orderDate: salesOrders.orderDate,
      truckEnterTime: salesOrders.truckEnterTime,
      truckLeaveTime: salesOrders.truckLeaveTime,
    })
    .from(salesOrders)
    .where(
      and(
        isNotNull(salesOrders.truckEnterTime),
        gte(salesOrders.truckEnterTime, startIso),
        lte(salesOrders.truckEnterTime, endIso)
      )
    );

  if (orders.length === 0) {
    return NextResponse.json({ totalSalesOrders: 0, totalUnits: 0, totalSkus: 0, salesOrders: [] });
  }

  const orderIds = orders.map((o) => o.id);

  const shipEvents = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStockEvents.quantity,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .where(and(eq(locationStockEvents.type, "SHIP"), inArray(locationStockEvents.salesOrderId, orderIds)));

  type LineItem = {
    itemId: number;
    itemSku: string;
    itemName: string;
    quantity: number;
  };

  const linesByOrder = new Map<number, Map<number, LineItem>>();
  for (const ev of shipEvents) {
    if (ev.salesOrderId == null) continue;
    if (!linesByOrder.has(ev.salesOrderId)) linesByOrder.set(ev.salesOrderId, new Map());
    const lines = linesByOrder.get(ev.salesOrderId)!;
    const qty = Math.abs(ev.quantity);
    let line = lines.get(ev.itemId);
    if (!line) {
      line = { itemId: ev.itemId, itemSku: ev.itemSku, itemName: ev.itemName, quantity: 0 };
      lines.set(ev.itemId, line);
    }
    line.quantity += qty;
  }

  const salesOrdersOut = orders
    .map((o) => {
      const lines = Array.from(linesByOrder.get(o.id)?.values() ?? []).sort((a, b) =>
        a.itemSku.localeCompare(b.itemSku)
      );
      const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

      // Time needed = how long the truck was actually at the dock. Only
      // computable once both ends are logged; still shown (as "—" for
      // duration) if truck_leave_time hasn't been recorded yet.
      const enterMs = o.truckEnterTime ? new Date(o.truckEnterTime).getTime() : null;
      const leaveMs = o.truckLeaveTime ? new Date(o.truckLeaveTime).getTime() : null;
      const durationMs = enterMs != null && leaveMs != null ? leaveMs - enterMs : null;

      return {
        salesOrderId: o.id,
        soNumber: o.soNumber,
        orderDate: o.orderDate,
        truckEnterTime: o.truckEnterTime,
        truckLeaveTime: o.truckLeaveTime,
        durationMs,
        totalQuantity,
        skuCount: lines.length,
        lines,
      };
    })
    .sort((a, b) => new Date(b.truckEnterTime!).getTime() - new Date(a.truckEnterTime!).getTime());

  const totalUnits = salesOrdersOut.reduce((sum, o) => sum + o.totalQuantity, 0);
  const totalSkus = new Set(shipEvents.map((e) => e.itemId)).size;

  return NextResponse.json({
    totalSalesOrders: salesOrdersOut.length,
    totalUnits,
    totalSkus,
    salesOrders: salesOrdersOut,
  });
}