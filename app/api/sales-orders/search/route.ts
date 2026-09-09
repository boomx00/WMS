import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, locationStockEvents, tambahanOrders } from "@/db/schema";
import { eq, inArray, ilike, or, isNotNull } from "drizzle-orm";

// GET /api/sales-orders/search-any?q=...
//
// Unlike /api/sales-orders/open-list, this does NOT filter out DONE
// orders — it's for the PDA search bar, so a driver can still find and
// open a fully-shipped SO to work on its Tambahan.
//
// Also matches against a Tambahan's convertedSoNumber: since conversion
// is a label-only action (no real sales_orders row gets created for the
// new number), searching that number wouldn't find anything otherwise —
// but the driver still needs to reach the PARENT SO to continue shipping
// the Tambahan's remaining stock, since that's where the actual
// picking/shipping screens and the Tambahan section live.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json([]);
  }

  const directMatches = await db
    .select()
    .from(salesOrders)
    .where(ilike(salesOrders.soNumber, `%${q}%`))
    .limit(50);

  const tambahanMatches = await db
    .select({
      parentSalesOrderId: tambahanOrders.parentSalesOrderId,
      convertedSoNumber: tambahanOrders.convertedSoNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
    })
    .from(tambahanOrders)
    .where(
      or(
        ilike(tambahanOrders.convertedSoNumber, `%${q}%`),
        ilike(tambahanOrders.tambahanNumber, `%${q}%`)
      )
    )
    .limit(50);

  const directIds = new Set(directMatches.map((o) => o.id));
  const extraParentIds = tambahanMatches
    .map((t) => t.parentSalesOrderId)
    .filter((id) => !directIds.has(id));

  const matchNoteByParentId = new Map<number, string>();
  for (const t of tambahanMatches) {
    if (directIds.has(t.parentSalesOrderId)) continue;
    matchNoteByParentId.set(
      t.parentSalesOrderId,
      t.convertedSoNumber && t.convertedSoNumber.toLowerCase().includes(q.toLowerCase())
        ? `matched via converted Tambahan → ${t.convertedSoNumber}`
        : `matched via Tambahan ${t.tambahanNumber}`
    );
  }

  const extraParents = extraParentIds.length
    ? await db.select().from(salesOrders).where(inArray(salesOrders.id, extraParentIds))
    : [];

  const allOrders = [...directMatches, ...extraParents];
  if (allOrders.length === 0) {
    return NextResponse.json([]);
  }

  const orderIds = allOrders.map((o) => o.id);

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
      shipped: locationStockEvents.quantity,
    })
    .from(locationStockEvents)
    .where(inArray(locationStockEvents.salesOrderId, orderIds));

  const shippedMap = new Map<string, number>();
  for (const r of shippedRows) {
    if (r.salesOrderId === null) continue;
    const key = `${r.salesOrderId}-${r.itemId}`;
    shippedMap.set(key, (shippedMap.get(key) ?? 0) + r.shipped);
  }

  const linesByOrder = new Map<number, typeof lines>();
  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId)!.push(line);
  }

  const result = allOrders
    .map((order) => {
      const orderLines = linesByOrder.get(order.id) ?? [];

      let anyActivity = false;
      let allDone = orderLines.length > 0;

      for (const line of orderLines) {
        const shipped = shippedMap.get(`${order.id}-${line.itemId}`) ?? 0;
        if (shipped > 0) anyActivity = true;
        if (shipped < line.orderedQty) allDone = false;
      }

      const status = allDone ? "DONE" : anyActivity ? "IN_PROGRESS" : "PENDING";
      const matchNote = matchNoteByParentId.get(order.id);

      return { soNumber: order.soNumber, orderDate: order.orderDate, status, matchNote };
    })
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  return NextResponse.json(result);
}