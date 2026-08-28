import { locationStockEvents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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