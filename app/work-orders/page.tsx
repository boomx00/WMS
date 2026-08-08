import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import WorkOrdersTable from "./WorkOrdersTable";

export const dynamic = "force-dynamic";

async function getWorkOrderSummary() {
  const rows = await db
    .select({
      workOrderNumber: pallets.workOrderNumber,
      itemSku: items.sku,
      itemName: items.name,
      totalQuantity: sql<number>`sum(${pallets.quantity})::int`,
      palletCount: sql<number>`count(*)::int`,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .groupBy(pallets.workOrderNumber, items.sku, items.name)
    .orderBy(pallets.workOrderNumber);

  const byWorkOrder = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byWorkOrder.has(row.workOrderNumber)) {
      byWorkOrder.set(row.workOrderNumber, []);
    }
    byWorkOrder.get(row.workOrderNumber)!.push(row);
  }

  return Array.from(byWorkOrder.entries()).map(([workOrderNumber, lines]) => ({
    workOrderNumber,
    lines,
    totalQuantity: lines.reduce((sum, l) => sum + l.totalQuantity, 0),
    totalPallets: lines.reduce((sum, l) => sum + l.palletCount, 0),
  }));
}

async function getPalletsByWorkOrder() {
  const rows = await db
    .select({
      workOrderNumber: pallets.workOrderNumber,
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      status: pallets.status,
      itemSku: items.sku,
      locationCode: locations.code,
      inboundAt: pallets.inboundAt,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .orderBy(pallets.inboundAt);

  const byWorkOrder = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byWorkOrder.has(row.workOrderNumber)) {
      byWorkOrder.set(row.workOrderNumber, []);
    }
    byWorkOrder.get(row.workOrderNumber)!.push(row);
  }

  return byWorkOrder;
}

export default async function WorkOrdersPage() {
  const [workOrders, palletsByWorkOrder] = await Promise.all([
    getWorkOrderSummary(),
    getPalletsByWorkOrder(),
  ]);

  const workOrdersWithPallets = workOrders.map((wo) => ({
    ...wo,
    pallets: palletsByWorkOrder.get(wo.workOrderNumber) ?? [],
  }));

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Work Orders</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Total quantity inbound per work order, including any split-off
          portions (Leftover/Destroy). Click a work order to see individual
          pallets.
        </p>
      </header>

      <WorkOrdersTable workOrders={workOrdersWithPallets} />
    </div>
  );
}