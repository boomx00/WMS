import { palletEvents, pallets, shipmentRevisions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Real shipped quantity for (salesOrderId, itemId), net of any revisions.
// A revision "moves" quantity from the originally (mistakenly) shipped
// item's total to the item that actually reached the customer — the raw
// SHIP event history is never altered, just accounted for correctly here.
export async function getShippedQuantity(
  db: any,
  salesOrderId: number,
  itemId: number
): Promise<number> {
  const [rawRow] = await db
    .select({ total: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int` })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(
      and(
        eq(palletEvents.salesOrderId, salesOrderId),
        eq(pallets.itemId, itemId),
        eq(palletEvents.type, "OUTBOUND")
      )
    );

  const [revisedAwayRow] = await db
    .select({ total: sql<number>`coalesce(sum(${shipmentRevisions.quantity}), 0)::int` })
    .from(shipmentRevisions)
    .where(
      and(
        eq(shipmentRevisions.salesOrderId, salesOrderId),
        eq(shipmentRevisions.originalItemId, itemId)
      )
    );

  const [revisedInRow] = await db
    .select({ total: sql<number>`coalesce(sum(${shipmentRevisions.quantity}), 0)::int` })
    .from(shipmentRevisions)
    .where(
      and(
        eq(shipmentRevisions.salesOrderId, salesOrderId),
        eq(shipmentRevisions.revisedItemId, itemId)
      )
    );

  return (rawRow?.total ?? 0) - (revisedAwayRow?.total ?? 0) + (revisedInRow?.total ?? 0);
}