import { locationStockEvents, salesOrders, salesOrderItems, tambahanOrders } from "@/db/schema";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";

export type MarkedBySoRow = { salesOrderId: number; soNumber: string; quantity: number };
export type MarkedByTambahanRow = { tambahanOrderId: number; tambahanNumber: string; quantity: number };

// Computes everything currently marked to an open SO or any Tambahan
// (open or converted) for a given item, in a small, FIXED number of
// batched queries — regardless of how many SOs/Tambahans have ever
// touched this item. Replaces what used to be a per-SO/per-Tambahan loop
// making several sequential round-trips EACH, which scaled linearly (and
// slowly) with history size. This is the single source of truth both the
// Outbound WH breakdown display and getUnclaimedQuantity build on now, so
// the two can never drift apart from computing the same thing two
// different, slightly-inconsistent ways.
export async function getMarkedBreakdownForItem(
  db: any,
  itemId: number
): Promise<{ bySo: MarkedBySoRow[]; byTambahan: MarkedByTambahanRow[]; totalMarked: number }> {
  const [soIdRows, tambahanIdRows] = await Promise.all([
    db
      .selectDistinct({ salesOrderId: locationStockEvents.salesOrderId })
      .from(locationStockEvents)
      .where(and(eq(locationStockEvents.itemId, itemId), isNotNull(locationStockEvents.salesOrderId))),
    db
      .selectDistinct({ tambahanOrderId: locationStockEvents.tambahanOrderId })
      .from(locationStockEvents)
      .where(and(eq(locationStockEvents.itemId, itemId), isNotNull(locationStockEvents.tambahanOrderId))),
  ]);

  const soIds: number[] = soIdRows.map((r: any) => r.salesOrderId).filter((id: any) => id !== null);
  const tambahanIds: number[] = tambahanIdRows.map((r: any) => r.tambahanOrderId).filter((id: any) => id !== null);

  const bySo: MarkedBySoRow[] = [];
  let totalMarkedSo = 0;

  if (soIds.length > 0) {
    const [orderLines, soRows, addRows, shipRows] = await Promise.all([
      db
        .select({ salesOrderId: salesOrderItems.salesOrderId, quantity: salesOrderItems.quantity })
        .from(salesOrderItems)
        .where(and(inArray(salesOrderItems.salesOrderId, soIds), eq(salesOrderItems.itemId, itemId))),
      db
        .select({ id: salesOrders.id, soNumber: salesOrders.soNumber })
        .from(salesOrders)
        .where(inArray(salesOrders.id, soIds)),
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
            sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')`
          )
        )
        .groupBy(locationStockEvents.salesOrderId),
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
    const addBySo = new Map<number, number>(addRows.map((r: any) => [r.salesOrderId, r.total]));
    const shipBySo = new Map<number, number>(shipRows.map((r: any) => [r.salesOrderId, r.total]));

    for (const soId of soIds) {
      const ordered = orderedBySo.get(soId);
      if (ordered === undefined) continue; // item isn't actually on this SO

      const shipped = shipBySo.get(soId) ?? 0;
      if (shipped >= ordered) continue; // fully shipped — no longer reserving stock

      const netMarked = (addBySo.get(soId) ?? 0) - shipped;
      totalMarkedSo += Math.max(0, netMarked);
      if (netMarked !== 0) {
        bySo.push({ salesOrderId: soId, soNumber: soNumberById.get(soId) ?? "?", quantity: netMarked });
      }
    }
  }

  const byTambahan: MarkedByTambahanRow[] = [];
  let totalMarkedTambahan = 0;

  if (tambahanIds.length > 0) {
    const [tambahanRows, addRows, shipRows] = await Promise.all([
      db
        .select({ id: tambahanOrders.id, tambahanNumber: tambahanOrders.tambahanNumber })
        .from(tambahanOrders)
        .where(inArray(tambahanOrders.id, tambahanIds)),
      db
        .select({
          tambahanOrderId: locationStockEvents.tambahanOrderId,
          total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
        })
        .from(locationStockEvents)
        .where(
          and(
            inArray(locationStockEvents.tambahanOrderId, tambahanIds),
            eq(locationStockEvents.itemId, itemId),
            sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')`
          )
        )
        .groupBy(locationStockEvents.tambahanOrderId),
      db
        .select({
          tambahanOrderId: locationStockEvents.tambahanOrderId,
          total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
        })
        .from(locationStockEvents)
        .where(
          and(
            inArray(locationStockEvents.tambahanOrderId, tambahanIds),
            eq(locationStockEvents.itemId, itemId),
            eq(locationStockEvents.type, "SHIP")
          )
        )
        .groupBy(locationStockEvents.tambahanOrderId),
    ]);

    const numberById = new Map<number, string>(tambahanRows.map((t: any) => [t.id, t.tambahanNumber]));
    const addByTambahan = new Map<number, number>(addRows.map((r: any) => [r.tambahanOrderId, r.total]));
    const shipByTambahan = new Map<number, number>(shipRows.map((r: any) => [r.tambahanOrderId, r.total]));

    for (const tId of tambahanIds) {
      const netMarked = (addByTambahan.get(tId) ?? 0) - (shipByTambahan.get(tId) ?? 0);
      totalMarkedTambahan += Math.max(0, netMarked);
      if (netMarked !== 0) {
        byTambahan.push({ tambahanOrderId: tId, tambahanNumber: numberById.get(tId) ?? "?", quantity: netMarked });
      }
    }
  }

  return { bySo, byTambahan, totalMarked: totalMarkedSo + totalMarkedTambahan };
}