import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items } from "@/db/schema";
import { eq, inArray, desc, sql } from "drizzle-orm";
import SalesOrdersClient from "./SalesOrdersClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function getTotalOrderCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(salesOrders);
  return row.count;
}

async function getSalesOrdersForPage(page: number) {
  const offset = (page - 1) * PAGE_SIZE;

  const orders = await db
    .select()
    .from(salesOrders)
    .orderBy(desc(salesOrders.orderDate))
    .limit(PAGE_SIZE)
    .offset(offset);

  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      quantity: salesOrderItems.quantity,
      itemSku: items.sku,
      itemName: items.name,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id))
    .where(inArray(salesOrderItems.salesOrderId, orderIds));

  const { palletEvents, pallets, locationStockEvents, locations } = await import("@/db/schema");

  const shippedRows = await db
    .select({
      salesOrderId: palletEvents.salesOrderId,
      itemId: pallets.itemId,
      shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(
      sql`${palletEvents.type} = 'OUTBOUND' AND ${inArray(palletEvents.salesOrderId, orderIds)}`
    )
    .groupBy(palletEvents.salesOrderId, pallets.itemId);

  // Where each item's picked quantity actually came from — one row per
  // (SO, item, source location), summed if picked multiple times.
  const pickSourceRows = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      locationCode: locations.code,
      type: locationStockEvents.type,
      quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .innerJoin(locations, eq(locationStockEvents.sourceLocationId, locations.id))
    .where(
      sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING') AND ${inArray(locationStockEvents.salesOrderId, orderIds)}`
    )
    .groupBy(locationStockEvents.salesOrderId, locationStockEvents.itemId, locations.code, locationStockEvents.type);

  const shippedMap = new Map<string, number>();
  for (const row of shippedRows) {
    if (row.salesOrderId === null) continue;
    shippedMap.set(`${row.salesOrderId}-${row.itemId}`, row.shipped);
  }

  const pickSourceMap = new Map<string, { locationCode: string; quantity: number; type: string }[]>();
  for (const row of pickSourceRows) {
    if (row.salesOrderId === null) continue;
    const key = `${row.salesOrderId}-${row.itemId}`;
    if (!pickSourceMap.has(key)) pickSourceMap.set(key, []);
    pickSourceMap.get(key)!.push({
      locationCode: row.locationCode,
      quantity: row.quantity,
      type: row.type,
    });
  }

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

  return orders.map((o) => ({
    ...o,
    items: (linesByOrder.get(o.id) ?? []).map((line) => {
      const shipped = shippedMap.get(`${o.id}-${line.itemId}`) ?? 0;
      const status: "PENDING" | "PICKING" | "SHIPPED" =
  shipped === 0 ? "PENDING" : shipped >= line.quantity ? "SHIPPED" : "PICKING";
      const pickedFrom = pickSourceMap.get(`${o.id}-${line.itemId}`) ?? [];
      return { ...line, shipped, status, pickedFrom };
    }),
  }));
}

async function getAllItems() {
  return db.select({ sku: items.sku, name: items.name }).from(items).orderBy(items.sku);
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [totalCount, orders, allItems] = await Promise.all([
    getTotalOrderCount(),
    getSalesOrdersForPage(page),
    getAllItems(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Sales Orders</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Create and view sales orders / picking lists.
        </p>
      </header>

      <SalesOrdersClient
        orders={orders}
        allItems={allItems}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />
    </div>
  );
}