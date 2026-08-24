import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  salesOrders,
  salesOrderItems,
  items,
  palletEvents,
  pallets,
  locationStockEvents,
  locations,
  users,
  shipmentRevisions,
} from "@/db/schema";
import { eq, and, inArray, ilike, desc, sql } from "drizzle-orm";
import { getShippedQuantity } from "@/lib/shippedQuantity";

// GET /api/sales-orders/search?q=...
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const matchedOrders = await db
    .select()
    .from(salesOrders)
    .where(ilike(salesOrders.soNumber, `%${q}%`))
    .orderBy(desc(salesOrders.orderDate))
    .limit(50);

  if (matchedOrders.length === 0) {
    return NextResponse.json([]);
  }

  const orderIds = matchedOrders.map((o) => o.id);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      quantity: salesOrderItems.quantity,
      itemSku: items.sku,
      itemName: items.name,
      palletCartonQty: items.palletCartonQty,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id))
    .where(inArray(salesOrderItems.salesOrderId, orderIds));

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

const results = await Promise.all(
  matchedOrders.map(async (o) => {
    const orderLines = linesByOrder.get(o.id) ?? [];
    const withStatus = await Promise.all(
      orderLines.map(async (line) => {
        const shipped = await getShippedQuantity(db, o.id, line.itemId);
        const status: "PENDING" | "PICKING" | "SHIPPED" =
          shipped === 0 ? "PENDING" : shipped >= line.quantity ? "SHIPPED" : "PICKING";

        const pickedFromRows = await db
          .select({
            locationCode: locations.code,
            type: locationStockEvents.type,
            username: users.username,
            quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
          })
          .from(locationStockEvents)
          .innerJoin(locations, eq(locationStockEvents.sourceLocationId, locations.id))
          .innerJoin(users, eq(locationStockEvents.userId, users.id))
          .where(
            and(
              eq(locationStockEvents.salesOrderId, o.id),
              eq(locationStockEvents.itemId, line.itemId),
              sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING')`
            )
          )
          .groupBy(locations.code, locationStockEvents.type, users.username);

        const shippedByRows = await db
          .select({
            username: users.username,
            quantity: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
          })
          .from(palletEvents)
          .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
          .innerJoin(users, eq(palletEvents.userId, users.id))
          .where(
            and(
              eq(palletEvents.salesOrderId, o.id),
              eq(pallets.itemId, line.itemId),
              eq(palletEvents.type, "OUTBOUND")
            )
          )
          .groupBy(users.username);

        return {
          ...line,
          shipped,
          status,
          pickedFrom: pickedFromRows,
          shippedBy: shippedByRows,
          revisions: [],
        };
      })
    );

    const allComplete = withStatus.length > 0 && withStatus.every((l) => l.status === "SHIPPED");
    const anyShipped = withStatus.some((l) => l.shipped > 0);
    const overallStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED" = allComplete
      ? "COMPLETE"
      : anyShipped
      ? "PARTIAL"
      : "NOT_STARTED";

    const pickedByUsers = Array.from(
      new Set(withStatus.flatMap((l) => l.pickedFrom.map((p: any) => p.username)))
    );

    return { ...o, items: withStatus, overallStatus, pickedByUsers };
  })
);

  return NextResponse.json(results);
}