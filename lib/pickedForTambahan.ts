import { locationStockEvents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Net quantity currently picked-and-not-yet-shipped for (tambahanOrderId, itemId).
// Tambahan has no predefined "ordered" quantity — it's a free-pick log — so
// this is simply picked minus shipped, with no ceiling to cap against.
export async function getPickedForTambahanQuantity(
  db: any,
  tambahanOrderId: number,
  itemId: number
): Promise<number> {
  const [pickRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahanOrderId),
        eq(locationStockEvents.itemId, itemId),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING')`
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

  return (pickRow?.total ?? 0) - (shipRow?.total ?? 0);
}