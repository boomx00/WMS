import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, locationStockEvents } from "@/db/schema";
import { eq, inArray, ilike, sql } from "drizzle-orm";
import { tambahanOrders } from "@/db/schema";
// GET /api/sales-orders/search-any?q=...
//
// Unlike /api/sales-orders/open-list, this does NOT filter out DONE
// orders — it's for the PDA search bar, so a driver can still find and
// open a fully-shipped SO to work on its Tambahan.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json([]);
  }

  const orders = await db
    .select()
    .from(salesOrders)
    .where(ilike(salesOrders.soNumber, `%${q}%`))
    .limit(50);

  if (orders.length === 0) {
    return NextResponse.json([]);
  }

  const orderIds = orders.map((o) => o.id);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      orderedQty: salesOrderItems.quantity,
    })
    .from(salesOrderItems)
    .where(inArray(salesOrderItems.salesOrderId, orderIds));

  const shippedRows = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      shipped: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(inArray(locationStockEvents.salesOrderId, orderIds))
    .groupBy(locationStockEvents.salesOrderId, locationStockEvents.itemId);

  const activeTambahanRows = await db
    .select({ parentSalesOrderId: tambahanOrders.parentSalesOrderId })
    .from(tambahanOrders)
    .where(eq(tambahanOrders.status, "ACTIVE"));
  const activeTambahanSet = new Set(activeTambahanRows.map((r) => r.parentSalesOrderId));

  const shippedMap = new Map<string, number>();
  for (const r of shippedRows) {
    if (r.salesOrderId === null) continue;
    shippedMap.set(`${r.salesOrderId}-${r.itemId}`, r.shipped);
  }

  const linesByOrder = new Map<number, typeof lines>();
  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId)!.push(line);
  }

  const result = orders
    .map((order) => {
      const orderLines = linesByOrder.get(order.id) ?? [];

      let anyActivity = false;
      let allDone = orderLines.length > 0;

      for (const line of orderLines) {
        const shipped = shippedMap.get(`${order.id}-${line.itemId}`) ?? 0;
        if (shipped > 0) anyActivity = true;
        if (shipped < line.orderedQty) allDone = false;
      }
      // An active Tambahan means this SO isn't really done — there's
      // more to pick/ship, even though its original lines are complete.
      if (allDone && activeTambahanSet.has(order.id)) {
        allDone = false;
        anyActivity = true;
      }
      const status = allDone ? "DONE" : anyActivity ? "IN_PROGRESS" : "PENDING";

      return { soNumber: order.soNumber, orderDate: order.orderDate, status };
    })
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  return NextResponse.json(result);
}