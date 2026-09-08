import {
  locations,
  locationStock,
  locationStockEvents,
  salesOrderItems,
  tambahanOrders,
} from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getPickedForTambahanQuantity } from "@/lib/pickedForTambahan";
import { getShippedQuantity } from "@/lib/shippedQuantity";

// "Unmarked" is derived as a residual — total physical stock in Outbound WH
// minus everything legitimately marked to an open SO or active Tambahan —
// rather than as an independently-accumulated ledger sum. This is
// deliberate: a ledger sum only knows about the specific event types it
// was written to watch for (PICKING, CLAIM, RELEASE...), so any other
// event type that changes Outbound WH's physical total (MOVE, a future
// event type, etc.) silently orphans it. Deriving from the current
// physical total instead means it can never drift, by construction.
export async function getUnclaimedQuantity(db: any, itemId: number): Promise<number> {
  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) return 0;

  const [stockRow] = await db
    .select({ quantity: locationStock.quantity })
    .from(locationStock)
    .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, itemId)));
  const total = stockRow?.quantity ?? 0;

  const distinctSoRows = await db
    .selectDistinct({ salesOrderId: locationStockEvents.salesOrderId })
    .from(locationStockEvents)
    .where(and(eq(locationStockEvents.itemId, itemId), isNotNull(locationStockEvents.salesOrderId)));

  let totalMarkedSo = 0;
  for (const row of distinctSoRows) {
    if (row.salesOrderId === null) continue;

    const [orderLine] = await db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, row.salesOrderId), eq(salesOrderItems.itemId, itemId)));
    if (!orderLine) continue;

    const shipped = await getShippedQuantity(db, row.salesOrderId, itemId);
    if (shipped >= orderLine.quantity) continue; // fully shipped — no longer reserving stock

    totalMarkedSo += Math.max(0, await getPickedForSoQuantity(db, row.salesOrderId, itemId));
  }

  const distinctTambahanRows = await db
    .selectDistinct({ tambahanOrderId: locationStockEvents.tambahanOrderId, status: tambahanOrders.status })
    .from(locationStockEvents)
    .innerJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .where(and(eq(locationStockEvents.itemId, itemId), isNotNull(locationStockEvents.tambahanOrderId)));

  let totalMarkedTambahan = 0;
  for (const row of distinctTambahanRows) {
    if (row.tambahanOrderId === null || row.status === "CONVERTED") continue;
    totalMarkedTambahan += Math.max(0, await getPickedForTambahanQuantity(db, row.tambahanOrderId, itemId));
  }

  return total - totalMarkedSo - totalMarkedTambahan;
}