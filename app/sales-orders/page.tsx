import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, palletEvents, pallets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import SalesOrdersClient from "./SalesOrdersClient";

export const dynamic = "force-dynamic";

async function getSalesOrders() {
  const orders = await db.select().from(salesOrders).orderBy(salesOrders.orderDate);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      quantity: salesOrderItems.quantity,
      itemSku: items.sku,
      itemName: items.name,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id));

  // Sum shipped quantity per (salesOrderId, itemId)
  const shippedRows = await db
    .select({
      salesOrderId: palletEvents.salesOrderId,
      itemId: pallets.itemId,
      shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(and(eq(palletEvents.type, "OUTBOUND")))
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
    const status: "PENDING" | "PICKING" | "SHIPPED" =
      shipped === 0 ? "PENDING" : shipped >= line.quantity ? "SHIPPED" : "PICKING";
    return { ...line, shipped, status };
  }),
}));
}

async function getAllItems() {
  return db.select({ sku: items.sku, name: items.name }).from(items).orderBy(items.sku);
}

export default async function SalesOrdersPage() {
  const [orders, allItems] = await Promise.all([getSalesOrders(), getAllItems()]);

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Sales Orders</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Create and view sales orders / picking lists.
        </p>
      </header>

      <SalesOrdersClient orders={orders} allItems={allItems} />
    </div>
  );
}