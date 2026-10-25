import { locationStockEvents, salesOrders, salesOrderItems, tambahanOrders } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getMarkRows, isMarkingEnabled } from "@/lib/stagingMarks";

export type MarkedBySoRow = { salesOrderId: number; soNumber: string; quantity: number };
export type MarkedByTambahanRow = { tambahanOrderId: number; tambahanNumber: string; quantity: number };

// Everything currently marked to an open SO or any Tambahan (open or
// converted) for an item — at one staging location (locationId), or across
// all of them (no locationId). A small, FIXED number of batched queries
// regardless of how many orders ever touched the item. This is the single
// source of truth the staging breakdown display and getUnclaimedQuantity
// both build on, so the two can never drift apart.
//
// An SO only reserves stock while it's open: finished SOs and SOs whose
// line is fully shipped are left out. With order marking turned off,
// nothing is reserved.
export async function getMarkedBreakdownForItem(
  db: any,
  itemId: number,
  locationId?: number
): Promise<{ bySo: MarkedBySoRow[]; byTambahan: MarkedByTambahanRow[]; totalMarked: number }> {
  if (!(await isMarkingEnabled(db))) return { bySo: [], byTambahan: [], totalMarked: 0 };

  const rows = await getMarkRows(db, { itemId, locationId });

  const soTotals = new Map<number, number>();
  const tambahanTotals = new Map<number, number>();
  for (const r of rows) {
    if (r.salesOrderId !== null) soTotals.set(r.salesOrderId, (soTotals.get(r.salesOrderId) ?? 0) + r.quantity);
    else if (r.tambahanOrderId !== null)
      tambahanTotals.set(r.tambahanOrderId, (tambahanTotals.get(r.tambahanOrderId) ?? 0) + r.quantity);
  }

  const soIds = [...soTotals.keys()];
  const tambahanIds = [...tambahanTotals.keys()];

  const bySo: MarkedBySoRow[] = [];
  let totalMarkedSo = 0;

  if (soIds.length > 0) {
    const [orderLines, soRows, shipRows] = await Promise.all([
      db
        .select({ salesOrderId: salesOrderItems.salesOrderId, quantity: salesOrderItems.quantity })
        .from(salesOrderItems)
        .where(and(inArray(salesOrderItems.salesOrderId, soIds), eq(salesOrderItems.itemId, itemId))),
      db
        .select({ id: salesOrders.id, soNumber: salesOrders.soNumber, finishedAt: salesOrders.finishedAt })
        .from(salesOrders)
        .where(inArray(salesOrders.id, soIds)),
      // Shipped in total (every location) — decides whether the SO line
      // is fully shipped.
      db
        .select({
          salesOrderId: locationStockEvents.salesOrderId,
          total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
        })
        .from(locationStockEvents)
        .where(
          and(
            inArray(locationStockEvents.salesOrderId, soIds),
            eq(locationStockEvents.itemId, itemId),
            eq(locationStockEvents.type, "SHIP")
          )
        )
        .groupBy(locationStockEvents.salesOrderId),
    ]);

    const orderedBySo = new Map<number, number>(orderLines.map((l: any) => [l.salesOrderId, l.quantity]));
    const soNumberById = new Map<number, string>(soRows.map((s: any) => [s.id, s.soNumber]));
    const finishedById = new Map<number, boolean>(soRows.map((s: any) => [s.id, s.finishedAt !== null]));
    const shipBySo = new Map<number, number>(shipRows.map((r: any) => [r.salesOrderId, r.total]));

    for (const soId of soIds) {
      const ordered = orderedBySo.get(soId);
      if (ordered === undefined) continue; // item isn't actually on this SO

      if (finishedById.get(soId)) continue; // manually closed out — no longer reserving stock

      const shipped = shipBySo.get(soId) ?? 0;
      if (shipped >= ordered) continue; // fully shipped — no longer reserving stock

      const netMarked = soTotals.get(soId) ?? 0;
      totalMarkedSo += Math.max(0, netMarked);
      if (netMarked !== 0) {
        bySo.push({ salesOrderId: soId, soNumber: soNumberById.get(soId) ?? "?", quantity: netMarked });
      }
    }
  }

  const byTambahan: MarkedByTambahanRow[] = [];
  let totalMarkedTambahan = 0;

  if (tambahanIds.length > 0) {
    const tambahanRows = await db
      .select({ id: tambahanOrders.id, tambahanNumber: tambahanOrders.tambahanNumber })
      .from(tambahanOrders)
      .where(inArray(tambahanOrders.id, tambahanIds));
    const numberById = new Map<number, string>(tambahanRows.map((t: any) => [t.id, t.tambahanNumber]));

    for (const tId of tambahanIds) {
      const netMarked = tambahanTotals.get(tId) ?? 0;
      totalMarkedTambahan += Math.max(0, netMarked);
      if (netMarked !== 0) {
        byTambahan.push({ tambahanOrderId: tId, tambahanNumber: numberById.get(tId) ?? "?", quantity: netMarked });
      }
    }
  }

  return { bySo, byTambahan, totalMarked: totalMarkedSo + totalMarkedTambahan };
}
