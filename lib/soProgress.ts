// Picking and shipping progress per sales order, for the PDA's SO lists.
// Picking (by SO) shows pickStatus; Shipping shows shipStatus — so an SO
// that's fully picked but not yet shipped is DONE in Picking only.

import { db } from "@/lib/db";
import { salesOrderItems, pallets, palletEvents, locationStockEvents, tambahanOrders } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export type SoStage = "PENDING" | "IN_PROGRESS" | "DONE";
export type SoProgress = { pickStatus: SoStage; shipStatus: SoStage };

// Pass the SO ids to look at, or nothing for every SO.
export async function getSoProgress(orderIds?: number[]): Promise<Map<number, SoProgress>> {
  if (orderIds && orderIds.length === 0) return new Map();

  const lineFilter = orderIds ? inArray(salesOrderItems.salesOrderId, orderIds) : undefined;
  const eventFilter = orderIds ? inArray(locationStockEvents.salesOrderId, orderIds) : undefined;
  const shipFilter = orderIds ? inArray(palletEvents.salesOrderId, orderIds) : undefined;

  const [lines, pickedRows, shippedRows, activeTambahanRows] = await Promise.all([
    db
      .select({
        salesOrderId: salesOrderItems.salesOrderId,
        itemId: salesOrderItems.itemId,
        orderedQty: salesOrderItems.quantity,
      })
      .from(salesOrderItems)
      .where(lineFilter),

    // Everything ever picked or claimed for the SO. SHIP and RELEASE are
    // left out on purpose: shipping doesn't "un-pick" anything.
    db
      .select({
        salesOrderId: locationStockEvents.salesOrderId,
        itemId: locationStockEvents.itemId,
        picked: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
      })
      .from(locationStockEvents)
      .where(
        and(
          inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING", "CLAIM"]),
          eventFilter
        )
      )
      .groupBy(locationStockEvents.salesOrderId, locationStockEvents.itemId),

    // Shipped = OUTBOUND pallet events, same source as before.
    db
      .select({
        salesOrderId: palletEvents.salesOrderId,
        itemId: pallets.itemId,
        shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
      })
      .from(palletEvents)
      .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
      .where(and(eq(palletEvents.type, "OUTBOUND"), shipFilter))
      .groupBy(palletEvents.salesOrderId, pallets.itemId),

    db
      .select({ parentSalesOrderId: tambahanOrders.parentSalesOrderId })
      .from(tambahanOrders)
      .where(eq(tambahanOrders.status, "ACTIVE")),
  ]);

  const pickedMap = new Map<string, number>();
  for (const r of pickedRows) {
    if (r.salesOrderId === null) continue;
    pickedMap.set(`${r.salesOrderId}-${r.itemId}`, r.picked);
  }

  const shippedMap = new Map<string, number>();
  for (const r of shippedRows) {
    if (r.salesOrderId === null) continue;
    shippedMap.set(`${r.salesOrderId}-${r.itemId}`, r.shipped);
  }

  const activeTambahanSet = new Set(activeTambahanRows.map((r) => r.parentSalesOrderId));

  const linesByOrder = new Map<number, typeof lines>();
  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId)!.push(line);
  }

  const result = new Map<number, SoProgress>();
  const ids = orderIds ?? [...linesByOrder.keys()];

  for (const orderId of ids) {
    const orderLines = linesByOrder.get(orderId) ?? [];

    let anyActivity = false;
    let allPicked = orderLines.length > 0;
    let allShipped = orderLines.length > 0;

    for (const line of orderLines) {
      const picked = pickedMap.get(`${orderId}-${line.itemId}`) ?? 0;
      const shipped = shippedMap.get(`${orderId}-${line.itemId}`) ?? 0;

      if (picked > 0 || shipped > 0) anyActivity = true;
      // Anything shipped was picked first (covers shipments from before
      // SO-tagged picking existed).
      if (Math.max(picked, shipped) < line.orderedQty) allPicked = false;
      if (shipped < line.orderedQty) allShipped = false;
    }

    // An active Tambahan means there's still Tambahan stock to ship, even
    // though the original lines are complete.
    if (allShipped && activeTambahanSet.has(orderId)) {
      allShipped = false;
      anyActivity = true;
    }

    const stage = (done: boolean): SoStage => (done ? "DONE" : anyActivity ? "IN_PROGRESS" : "PENDING");
    result.set(orderId, { pickStatus: stage(allPicked), shipStatus: stage(allShipped) });
  }

  return result;
}
