import { locationStockEvents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Net quantity currently marked/earmarked for (tambahanOrderId, itemId):
//   + everything picked specifically under this Tambahan (PICKING, DEFAULT_PICKING)
//   + anything explicitly claimed from the unmarked pool (CLAIM) — this is
//     what a manual correction uses to nudge the total
//   + RELEASE (already stored as a negative quantity, so a plain sum
//     correctly subtracts it)
//   − everything actually shipped against this Tambahan (SHIP)
export async function getPickedForTambahanQuantity(
  db: any,
  tambahanOrderId: number,
  itemId: number
): Promise<number> {
  const [addRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahanOrderId),
        eq(locationStockEvents.itemId, itemId),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'RELEASE', 'CLAIM')`
      )
    );

  const [shipRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahanOrderId),
        eq(locationStockEvents.itemId, itemId),
        eq(locationStockEvents.type, "SHIP")
      )
    );

  return (addRow?.total ?? 0) - (shipRow?.total ?? 0);
}