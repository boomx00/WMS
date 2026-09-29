import { locationStockEvents } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Net quantity currently marked/earmarked for (salesOrderId, itemId):
//   + everything picked specifically for this SO (PICKING, DEFAULT_PICKING)
//   + anything explicitly claimed from the unmarked pool (CLAIM)
//   + RELEASE (already stored as a negative quantity, so a plain sum
//     correctly subtracts it)
//   − everything actually shipped against this SO (SHIP) — once shipped,
//     it's gone, no longer "marked and waiting," so it must come out of
//     this tally.
export async function getPickedForSoQuantity(
  db: any,
  salesOrderId: number,
  itemId: number
): Promise<number> {
  const [addRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.salesOrderId, salesOrderId),
        eq(locationStockEvents.itemId, itemId),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')`
      )
    );

  const [shipRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.salesOrderId, salesOrderId),
        eq(locationStockEvents.itemId, itemId),
        eq(locationStockEvents.type, "SHIP")
      )
    );

  return (addRow?.total ?? 0) - (shipRow?.total ?? 0);
}

// Batch version of getPickedForSoQuantity for list pages: the same net
// quantity for EVERY (salesOrderId, itemId) pair on the given orders, in
// ONE query instead of two queries per SO line.
// Returns a Map keyed `${salesOrderId}-${itemId}`; pairs with no events are
// simply absent (treat as 0).
export async function getPickedForSoQuantities(
  db: any,
  salesOrderIds: number[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (salesOrderIds.length === 0) return result;

  const rows: { salesOrderId: number; itemId: number; picked: number }[] = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      picked: sql<number>`(
        coalesce(sum(${locationStockEvents.quantity}) filter (
          where ${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')
        ), 0)
        - coalesce(sum(${locationStockEvents.quantity}) filter (
          where ${locationStockEvents.type} = 'SHIP'
        ), 0)
      )::int`,
    })
    .from(locationStockEvents)
    .where(
      and(
        inArray(locationStockEvents.salesOrderId, salesOrderIds),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM', 'SHIP')`
      )
    )
    .groupBy(locationStockEvents.salesOrderId, locationStockEvents.itemId);

  for (const row of rows) {
    result.set(`${row.salesOrderId}-${row.itemId}`, row.picked);
  }
  return result;
}