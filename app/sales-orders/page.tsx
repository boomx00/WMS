import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items } from "@/db/schema";
import { eq, inArray, desc, sql, and } from "drizzle-orm";
import SalesOrdersClient from "./SalesOrdersClient";
import { getSession } from "@/lib/auth";
import { users, roles } from "@/db/schema";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { tambahanOrders } from "@/db/schema";
async function getIsAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, session.userId));
  return row?.roleName?.toLowerCase() === "admin";
}
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
    palletCartonQty: items.palletCartonQty,
  })
  .from(salesOrderItems)
  .innerJoin(items, eq(salesOrderItems.itemId, items.id))
  .where(inArray(salesOrderItems.salesOrderId, orderIds));

  const { palletEvents, pallets, locationStockEvents, locations, users } = await import("@/db/schema");

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
  const activeTambahanRows = await db
    .select({ parentSalesOrderId: tambahanOrders.parentSalesOrderId })
    .from(tambahanOrders)
    .where(and(inArray(tambahanOrders.parentSalesOrderId, orderIds), eq(tambahanOrders.status, "ACTIVE")));
  const activeTambahanSet = new Set(activeTambahanRows.map((r) => r.parentSalesOrderId));
  // Who picked what, from where — one row per (SO, item, location, user).
  const pickSourceRows = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      locationCode: locations.code,
      type: locationStockEvents.type,
      username: users.username,
      quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .innerJoin(locations, eq(locationStockEvents.sourceLocationId, locations.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(
      sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING') AND ${inArray(locationStockEvents.salesOrderId, orderIds)}`
    )
    .groupBy(
      locationStockEvents.salesOrderId,
      locationStockEvents.itemId,
      locations.code,
      locationStockEvents.type,
      users.username
    );

  // Who shipped what, one row per (SO, item, user).
  const shippedByRows = await db
    .select({
      salesOrderId: palletEvents.salesOrderId,
      itemId: pallets.itemId,
      username: users.username,
      quantity: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(users, eq(palletEvents.userId, users.id))
    .where(
      sql`${palletEvents.type} = 'OUTBOUND' AND ${inArray(palletEvents.salesOrderId, orderIds)}`
    )
    .groupBy(palletEvents.salesOrderId, pallets.itemId, users.username);

  const shippedMap = new Map<string, number>();
  for (const row of shippedRows) {
    if (row.salesOrderId === null) continue;
    shippedMap.set(`${row.salesOrderId}-${row.itemId}`, row.shipped);
  }

  const pickSourceMap = new Map<
    string,
    { locationCode: string; quantity: number; type: string; username: string }[]
  >();
  for (const row of pickSourceRows) {
    if (row.salesOrderId === null) continue;
    const key = `${row.salesOrderId}-${row.itemId}`;
    if (!pickSourceMap.has(key)) pickSourceMap.set(key, []);
    pickSourceMap.get(key)!.push({
      locationCode: row.locationCode,
      quantity: row.quantity,
      type: row.type,
      username: row.username,
    });
  }

  const shippedByMap = new Map<string, { username: string; quantity: number }[]>();
  for (const row of shippedByRows) {
    if (row.salesOrderId === null) continue;
    const key = `${row.salesOrderId}-${row.itemId}`;
    if (!shippedByMap.has(key)) shippedByMap.set(key, []);
    shippedByMap.get(key)!.push({ username: row.username, quantity: row.quantity });
  }

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

return Promise.all(
  orders.map(async (o) => {
    const orderItems = await Promise.all(
      (linesByOrder.get(o.id) ?? []).map(async (line) => {
        const shipped = shippedMap.get(`${o.id}-${line.itemId}`) ?? 0;
        const picked = Math.max(0, await getPickedForSoQuantity(db, o.id, line.itemId));

        const status: "PENDING" | "PICKING" | "SHIPPED" =
          shipped >= line.quantity ? "SHIPPED" : shipped > 0 || picked > 0 ? "PICKING" : "PENDING";

        const pickedFrom = pickSourceMap.get(`${o.id}-${line.itemId}`) ?? [];
        const shippedBy = shippedByMap.get(`${o.id}-${line.itemId}`) ?? [];
        return { ...line, shipped, picked, status, pickedFrom, shippedBy };
      })
    );

    const allComplete = orderItems.length > 0 && orderItems.every((l) => l.status === "SHIPPED");
    const anyActivity = orderItems.some((l) => l.shipped > 0 || l.picked > 0);
    // An active Tambahan means there's still an outstanding batch on this
    // SO, even if every original line has shipped.
    const hasActiveTambahan = activeTambahanSet.has(o.id);
    const overallStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED" =
      allComplete && !hasActiveTambahan
        ? "COMPLETE"
        : anyActivity || hasActiveTambahan
        ? "PARTIAL"
        : "NOT_STARTED";
    const pickedByUsers = Array.from(
      new Set(orderItems.flatMap((l) => l.pickedFrom.map((p) => p.username)))
    );

    return {
      ...o,
      items: orderItems,
      overallStatus,
      pickedByUsers,
    };
  })
);
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

const [totalCount, orders, allItems, isAdmin] = await Promise.all([
  getTotalOrderCount(),
  getSalesOrdersForPage(page),
  db.select({ sku: items.sku, name: items.name }).from(items).orderBy(items.sku),
  getIsAdmin(),
]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-8 max-w-5xl">
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
  isAdmin={isAdmin}
/>
    </div>
  );
}