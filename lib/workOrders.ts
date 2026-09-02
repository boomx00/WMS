import { db } from "@/lib/db";
import { pallets, items, locations, palletEvents, users } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";

export async function getWorkOrderSummary(workOrderNumbers: string[]) {
  if (workOrderNumbers.length === 0) return [];

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
    .where(inArray(pallets.workOrderNumber, workOrderNumbers))
    .groupBy(pallets.workOrderNumber, items.sku, items.name);

  const originalInboundRows = await db
    .select({
      workOrderNumber: pallets.workOrderNumber,
      itemSku: items.sku,
      originalInbound: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(items, eq(pallets.itemId, items.id))
    .where(
      sql`${palletEvents.type} = 'INBOUND' AND ${inArray(pallets.workOrderNumber, workOrderNumbers)}`
    )
    .groupBy(pallets.workOrderNumber, items.sku);

  const originalInboundMap = new Map<string, number>();
  for (const row of originalInboundRows) {
    originalInboundMap.set(`${row.workOrderNumber}-${row.itemSku}`, row.originalInbound);
  }

  const palletDetailRows = await db
    .select({
      workOrderNumber: pallets.workOrderNumber,
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      status: pallets.status,
      itemSku: items.sku,
      locationCode: locations.code,
      inboundAt: pallets.inboundAt,
      inboundByUsername: users.username,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .leftJoin(users, eq(pallets.inboundUserId, users.id))
    .where(inArray(pallets.workOrderNumber, workOrderNumbers))
    .orderBy(pallets.inboundAt);

  const palletsByWo = new Map<string, typeof palletDetailRows>();
  for (const row of palletDetailRows) {
    if (!palletsByWo.has(row.workOrderNumber)) palletsByWo.set(row.workOrderNumber, []);
    palletsByWo.get(row.workOrderNumber)!.push(row);
  }

  const byWorkOrder = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byWorkOrder.has(row.workOrderNumber)) byWorkOrder.set(row.workOrderNumber, []);
    byWorkOrder.get(row.workOrderNumber)!.push(row);
  }

  return workOrderNumbers.map((wo) => {
    const lines = byWorkOrder.get(wo) ?? [];
    const linesWithInbound = lines.map((line) => ({
      ...line,
      originalInbound: originalInboundMap.get(`${wo}-${line.itemSku}`) ?? 0,
    }));

    const woPallets = palletsByWo.get(wo) ?? [];
    const firstInboundAt = woPallets.reduce<Date | null>((earliest, p) => {
      const at = new Date(p.inboundAt);
      return !earliest || at < earliest ? at : earliest;
    }, null);

    return {
      workOrderNumber: wo,
      lines: linesWithInbound,
      totalQuantity: lines.reduce((sum, l) => sum + l.totalQuantity, 0),
      totalPallets: lines.reduce((sum, l) => sum + l.palletCount, 0),
      totalOriginalInbound: linesWithInbound.reduce((sum, l) => sum + l.originalInbound, 0),
      firstInboundAt,
      pallets: woPallets,
    };
  });
}