import {
  items,
  locationStock,
  locationStockEvents,
  locations,
  palletEvents,
  salesOrderItems,
  salesOrders,
  shipmentRevisions,
  tambahanOrders,
} from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getMarkedLocations } from "@/lib/stagingMarks";
import { adjustLocationStock } from "@/lib/locationStock";

// Deleting a sales order (Sales Orders page, Manager only) puts everything
// it took back on FLOOR, one DELETE_SO stock event per line:
//   - stock still marked for it in a staging location: from that staging
//     location to FLOOR (as much as the location really holds)
//   - what already shipped (the SO's SHIP events): from nowhere to FLOOR
// Then the SO and its lines are deleted. Its past events keep their SO
// number in deleted_so_number (salesOrderId is cleared), so Movement
// History and the ledgers still show which SO they were for.

export const FLOOR_CODE = "FLOOR";

export type DeletePlanLine = {
  itemId: number;
  sku: string;
  name: string;
  kind: "staged" | "shipped";
  fromLocationId: number | null; // the staging location; null for shipped stock
  fromLocationCode: string | null;
  quantity: number;
  // Marked for the SO but the staging location holds less (only what's
  // there is moved).
  short: number;
};

export type DeletePlan =
  | { error: string; status: number }
  | {
      salesOrder: { id: number; soNumber: string; finishedAt: Date | null };
      floor: { id: number; code: string };
      lines: DeletePlanLine[];
    };

export async function planSalesOrderDeletion(db: any, soNumber: string): Promise<DeletePlan> {
  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) return { error: "Sales order not found", status: 404 };

  const [tambahan] = await db
    .select({ tambahanNumber: tambahanOrders.tambahanNumber })
    .from(tambahanOrders)
    .where(
      or(eq(tambahanOrders.parentSalesOrderId, salesOrder.id), eq(tambahanOrders.convertedSalesOrderId, salesOrder.id))
    )
    .limit(1);
  if (tambahan) {
    return {
      error: `This sales order has a Tambahan batch (${tambahan.tambahanNumber}), so it can't be deleted`,
      status: 409,
    };
  }

  const [floor] = await db
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(eq(locations.code, FLOOR_CODE));
  if (!floor) return { error: `There is no ${FLOOR_CODE} location to put the stock back on`, status: 409 };

  // Every product the SO has a line for or any stock event for.
  const [lineItems, eventItems] = await Promise.all([
    db
      .select({ itemId: salesOrderItems.itemId })
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, salesOrder.id)),
    db
      .selectDistinct({ itemId: locationStockEvents.itemId })
      .from(locationStockEvents)
      .where(eq(locationStockEvents.salesOrderId, salesOrder.id)),
  ]);
  const itemIds = [...new Set([...lineItems, ...eventItems].map((r: { itemId: number }) => r.itemId))];
  if (itemIds.length === 0) return { salesOrder, floor, lines: [] };

  const [itemRows, shippedRows] = await Promise.all([
    db.select({ id: items.id, sku: items.sku, name: items.name }).from(items).where(inArray(items.id, itemIds)),
    db
      .select({
        itemId: locationStockEvents.itemId,
        quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
      })
      .from(locationStockEvents)
      .where(and(eq(locationStockEvents.salesOrderId, salesOrder.id), eq(locationStockEvents.type, "SHIP")))
      .groupBy(locationStockEvents.itemId),
  ]);
  const itemById = new Map<number, { id: number; sku: string; name: string }>(
    itemRows.map((r: { id: number; sku: string; name: string }) => [r.id, r])
  );
  const shippedByItem = new Map<number, number>(
    shippedRows.map((r: { itemId: number; quantity: number }) => [r.itemId, r.quantity])
  );

  const lines: DeletePlanLine[] = [];
  for (const itemId of itemIds) {
    const item = itemById.get(itemId)!;
    const marked = [...(await getMarkedLocations(db, { salesOrderId: salesOrder.id }, itemId))].filter(
      ([locationId, qty]) => qty > 0 && locationId !== floor.id
    );
    if (marked.length > 0) {
      const [held, codes] = await Promise.all([
        db
          .select({ locationId: locationStock.locationId, quantity: locationStock.quantity })
          .from(locationStock)
          .where(
            and(eq(locationStock.itemId, itemId), inArray(locationStock.locationId, marked.map(([id]) => id)))
          ),
        db
          .select({ id: locations.id, code: locations.code })
          .from(locations)
          .where(inArray(locations.id, marked.map(([id]) => id))),
      ]);
      const heldAt = new Map<number, number>(held.map((h: { locationId: number; quantity: number }) => [h.locationId, h.quantity]));
      const codeOf = new Map<number, string>(codes.map((c: { id: number; code: string }) => [c.id, c.code]));
      for (const [locationId, qty] of marked) {
        const available = Math.max(0, heldAt.get(locationId) ?? 0);
        const quantity = Math.min(qty, available);
        lines.push({
          itemId,
          sku: item.sku,
          name: item.name,
          kind: "staged",
          fromLocationId: locationId,
          fromLocationCode: codeOf.get(locationId) ?? "?",
          quantity,
          short: qty - quantity,
        });
      }
    }
    const shipped = shippedByItem.get(itemId) ?? 0;
    if (shipped > 0) {
      lines.push({
        itemId,
        sku: item.sku,
        name: item.name,
        kind: "shipped",
        fromLocationId: null,
        fromLocationCode: null,
        quantity: shipped,
        short: 0,
      });
    }
  }
  lines.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }) || a.kind.localeCompare(b.kind));
  return { salesOrder, floor, lines };
}

// Carries out a plan from planSalesOrderDeletion (re-planned inside the
// caller's request, so it reflects the stock right now).
export async function deleteSalesOrder(
  db: any,
  plan: Exclude<DeletePlan, { error: string }>,
  userId: number
): Promise<void> {
  const { salesOrder, floor, lines } = plan;
  await db.transaction(async (tx: any) => {
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      if (line.fromLocationId !== null) {
        await adjustLocationStock(tx, line.fromLocationId, line.itemId, -line.quantity);
      }
      await adjustLocationStock(tx, floor.id, line.itemId, line.quantity);
      await tx.insert(locationStockEvents).values({
        type: "DELETE_SO",
        itemId: line.itemId,
        sourceLocationId: line.fromLocationId,
        destinationLocationId: floor.id,
        quantity: line.quantity,
        deletedSoNumber: salesOrder.soNumber,
        userId,
      });
    }

    // Past events keep the SO number but no longer point at the SO row.
    await tx
      .update(locationStockEvents)
      .set({ salesOrderId: null, deletedSoNumber: salesOrder.soNumber })
      .where(eq(locationStockEvents.salesOrderId, salesOrder.id));
    await tx.update(palletEvents).set({ salesOrderId: null }).where(eq(palletEvents.salesOrderId, salesOrder.id));
    await tx.delete(shipmentRevisions).where(eq(shipmentRevisions.salesOrderId, salesOrder.id));
    await tx.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, salesOrder.id));
    await tx.delete(salesOrders).where(eq(salesOrders.id, salesOrder.id));
  });
}
