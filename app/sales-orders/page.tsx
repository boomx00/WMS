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

  // Shipped totals only need to be computed for these specific orders.
  const { palletEvents, pallets } = await import("@/db/schema");
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

  const shippedMap = new Map<string, number>();
  for (const row of shippedRows) {
    if (row.salesOrderId === null) continue;
    shippedMap.set(`${row.salesOrderId}-${row.itemId}`, row.shipped);
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
      const status = shipped === 0 ? "PENDING" : shipped >= line.quantity ? "SHIPPED" : "PICKING";
      return { ...line, shipped, status };
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