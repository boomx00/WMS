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
  tambahanOrders,
} from "@/db/schema";
import { eq, and, inArray, ilike, desc, sql, or, notInArray } from "drizzle-orm";
import { getShippedQuantity } from "@/lib/shippedQuantity";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getTruckTimes, NO_TRUCK_TIMES } from "@/lib/truckTimes";
import { parseTypeFilter, typeFilterCondition } from "@/lib/salesOrderTypes";
// GET /api/sales-orders/search?q=...[&type=<id>|none]
//
// Matches the SO number, and also a Tambahan's number (TBH-…) or the real
// SO number it was converted to (e.g. an HPT number). Conversion only
// labels the Tambahan — no sales_orders row exists for that number — so
// those return the PARENT SO, where the Tambahan lives, with matchedVia
// saying why it's listed. Same matching as /api/sales-orders/search-any
// (PDA). The type filter applies to direct matches only: a converted
// number's own type isn't stored, and its parent may be of another type.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const directMatches = await db
    .select()
    .from(salesOrders)
    .where(
      and(
        ilike(salesOrders.soNumber, `%${q}%`),
        typeFilterCondition(parseTypeFilter(req.nextUrl.searchParams.get("type")))
      )
    )
    .orderBy(desc(salesOrders.orderDate))
    .limit(50);

  const tambahanMatches = await db
    .select({
      parentSalesOrderId: tambahanOrders.parentSalesOrderId,
      tambahanNumber: tambahanOrders.tambahanNumber,
      convertedSoNumber: tambahanOrders.convertedSoNumber,
    })
    .from(tambahanOrders)
    .where(
      and(
        or(ilike(tambahanOrders.tambahanNumber, `%${q}%`), ilike(tambahanOrders.convertedSoNumber, `%${q}%`)),
        directMatches.length > 0
          ? notInArray(
              tambahanOrders.parentSalesOrderId,
              directMatches.map((o) => o.id)
            )
          : undefined
      )
    )
    .limit(50);

  const matchedVia = new Map<number, string>();
  for (const t of tambahanMatches) {
    matchedVia.set(
      t.parentSalesOrderId,
      t.convertedSoNumber ? `${t.tambahanNumber} → ${t.convertedSoNumber}` : t.tambahanNumber
    );
  }

  const parentMatches = matchedVia.size
    ? await db
        .select()
        .from(salesOrders)
        .where(inArray(salesOrders.id, [...matchedVia.keys()]))
        .orderBy(desc(salesOrders.orderDate))
    : [];

  const matchedOrders = [...directMatches, ...parentMatches];

  if (matchedOrders.length === 0) {
    return NextResponse.json([]);
  }

  const orderIds = matchedOrders.map((o) => o.id);

  // An ACTIVE Tambahan keeps the SO open, same as the Sales Orders page.
  const activeTambahanRows = await db
    .select({ parentSalesOrderId: tambahanOrders.parentSalesOrderId })
    .from(tambahanOrders)
    .where(and(inArray(tambahanOrders.parentSalesOrderId, orderIds), eq(tambahanOrders.status, "ACTIVE")));
  const activeTambahanSet = new Set(activeTambahanRows.map((r) => r.parentSalesOrderId));

  // Truck enter = first pick, truck leave = last ship (from the ledger).
  const truckTimes = await getTruckTimes(db, orderIds);

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
    const picked = Math.max(0, await getPickedForSoQuantity(db, o.id, line.itemId));
    const status: "PENDING" | "PICKING" | "SHIPPED" =
      shipped >= line.quantity ? "SHIPPED" : shipped > 0 || picked > 0 ? "PICKING" : "PENDING";

        const pickedFromRows = await db
          .select({
            locationCode: locations.code,
            type: locationStockEvents.type,
            username: users.username,
            quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::float8`,
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
          picked,
          status,
          pickedFrom: pickedFromRows,
          shippedBy: shippedByRows,
          revisions: [],
        };
      })
    );

    // Same rule as the Sales Orders page (app/sales-orders/page.tsx).
    const allComplete = withStatus.length > 0 && withStatus.every((l) => l.status === "SHIPPED");
    const anyActivity = withStatus.some((l) => l.shipped > 0 || l.picked > 0);
    const hasActiveTambahan = activeTambahanSet.has(o.id);
    const overallStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED" =
      allComplete && !hasActiveTambahan
        ? "COMPLETE"
        : anyActivity || hasActiveTambahan
        ? "PARTIAL"
        : "NOT_STARTED";

    const pickedByUsers = Array.from(
      new Set(withStatus.flatMap((l) => l.pickedFrom.map((p: any) => p.username)))
    );

    const { truckEnterTime, truckLeaveTime } = truckTimes.get(o.id) ?? NO_TRUCK_TIMES;

    return {
      ...o,
      truckEnterTime,
      truckLeaveTime,
      items: withStatus,
      overallStatus,
      pickedByUsers,
      matchedVia: matchedVia.get(o.id) ?? null,
    };
  })
);

  return NextResponse.json(results);
}