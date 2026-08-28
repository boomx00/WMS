import { locationStockEvents } from "@/db/schema";
import { isNull, eq, and, sql } from "drizzle-orm";

// How much of an item, currently sitting in Outbound WH, has no SO
// attached — either it was never claimed (excess from a picking action
// that overshot what its SO needed), or it was released back by a
// Finish action. CLAIM events remove from this pool as SOs draw on it.
export async function getUnclaimedQuantity(db: any, itemId: number): Promise<number> {
  const [untaggedPicked] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(
      and(
        isNull(locationStockEvents.salesOrderId),
        eq(locationStockEvents.itemId, itemId),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING')`
      )
    );

  const [released] = await db
    .select({ total: sql<number>`coalesce(sum(-${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(and(eq(locationStockEvents.itemId, itemId), eq(locationStockEvents.type, "RELEASE")));

  const [claimed] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int` })
    .from(locationStockEvents)
    .where(and(eq(locationStockEvents.itemId, itemId), eq(locationStockEvents.type, "CLAIM")));

  return (untaggedPicked?.total ?? 0) + (released?.total ?? 0) - (claimed?.total ?? 0);
}