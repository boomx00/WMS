import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, salesOrders, salesOrderTypes } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getTruckTimesInWindow, NO_TRUCK_TIMES } from "@/lib/truckTimes";

// GET /api/analytics/sales-orders-shipped?start=...&end=...
//
// Which sales orders were worked in a date range, and what left against
// each one. "Worked in the range" means the truck entered OR left inside
// it, where (see lib/truckTimes.ts):
//   truck enter = the first picking for the SO
//   truck leave = the last shipping for the SO
// so an order whose truck arrived before the range start but left inside
// it (or vice versa) is still shown.
//
// Each order carries its document type (salesOrderTypeId / Name, null for
// older untyped orders); the panel's type checkboxes filter on that.
export async function GET(req: NextRequest) {
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

  // The range is WIB wall-clock ("YYYY-MM-DDTHH:mm" from the datetime
  // inputs), the same clock the truck times are shown in — not converted to
  // UTC in the browser. lib/truckTimes.ts converts it for the query.
  const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
  if (!WALL_CLOCK.test(startParam) || !WALL_CLOCK.test(endParam)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }
  // Minute precision: "From 08:00" starts at 08:00:00, "To 17:30"
  // includes all of 17:30.
  const startWall = startParam.replace("T", " ").slice(0, 16) + ":00";
  const endWall = endParam.replace("T", " ").slice(0, 16) + ":59.999999";

  const truckTimes = await getTruckTimesInWindow(db, startWall, endWall);
  const orderIds = Array.from(truckTimes.keys());

  if (orderIds.length === 0) {
    return NextResponse.json({ totalSalesOrders: 0, totalUnits: 0, totalSkus: 0, salesOrders: [] });
  }

  const [orders, shipEvents] = await Promise.all([
    db
      .select({
        id: salesOrders.id,
        soNumber: salesOrders.soNumber,
        orderDate: salesOrders.orderDate,
        salesOrderTypeId: salesOrders.salesOrderTypeId,
        salesOrderTypeName: salesOrderTypes.name,
      })
      .from(salesOrders)
      .leftJoin(salesOrderTypes, eq(salesOrders.salesOrderTypeId, salesOrderTypes.id))
      .where(inArray(salesOrders.id, orderIds)),

    db
      .select({
        salesOrderId: locationStockEvents.salesOrderId,
        itemId: locationStockEvents.itemId,
        itemSku: items.sku,
        itemName: items.name,
        quantity: locationStockEvents.quantity,
      })
      .from(locationStockEvents)
      .innerJoin(items, eq(locationStockEvents.itemId, items.id))
      .where(and(eq(locationStockEvents.type, "SHIP"), inArray(locationStockEvents.salesOrderId, orderIds))),
  ]);

  type LineItem = {
    itemId: number;
    itemSku: string;
    itemName: string;
    quantity: number;
  };

  // Shipment corrections are stored as a negative SHIP, so the plain sum is
  // what actually left.
  const linesByOrder = new Map<number, Map<number, LineItem>>();
  for (const ev of shipEvents) {
    if (ev.salesOrderId == null) continue;
    if (!linesByOrder.has(ev.salesOrderId)) linesByOrder.set(ev.salesOrderId, new Map());
    const lines = linesByOrder.get(ev.salesOrderId)!;
    let line = lines.get(ev.itemId);
    if (!line) {
      line = { itemId: ev.itemId, itemSku: ev.itemSku, itemName: ev.itemName, quantity: 0 };
      lines.set(ev.itemId, line);
    }
    line.quantity += ev.quantity;
  }

  const salesOrdersOut = orders
    .map((o) => {
      const lines = Array.from(linesByOrder.get(o.id)?.values() ?? [])
        .filter((l) => l.quantity !== 0)
        .sort((a, b) => a.itemSku.localeCompare(b.itemSku));
      const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

      // Time needed = last ship − first pick. Still shown (as "—" for the
      // duration) while the order is being picked and nothing has shipped.
      const { truckEnterTime, truckLeaveTime, durationMs } = truckTimes.get(o.id) ?? NO_TRUCK_TIMES;

      return {
        salesOrderId: o.id,
        soNumber: o.soNumber,
        salesOrderTypeId: o.salesOrderTypeId,
        salesOrderTypeName: o.salesOrderTypeName,
        orderDate: o.orderDate,
        truckEnterTime,
        truckLeaveTime,
        durationMs,
        totalQuantity,
        skuCount: lines.length,
        lines,
      };
    })
    // Wall-clock strings sort correctly as text.
    .sort((a, b) => {
      const at = a.truckEnterTime ?? a.truckLeaveTime ?? "";
      const bt = b.truckEnterTime ?? b.truckLeaveTime ?? "";
      return bt.localeCompare(at);
    });

  const totalUnits = salesOrdersOut.reduce((sum, o) => sum + o.totalQuantity, 0);
  const totalSkus = new Set(salesOrdersOut.flatMap((o) => o.lines.map((l) => l.itemId))).size;

  return NextResponse.json({
    totalSalesOrders: salesOrdersOut.length,
    totalUnits,
    totalSkus,
    salesOrders: salesOrdersOut,
  });
}
