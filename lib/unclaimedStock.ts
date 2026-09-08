import { locations, locationStock } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMarkedBreakdownForItem } from "@/lib/markedStock";

// "Unmarked" is total physical stock in Outbound WH minus everything
// legitimately marked to an open SO or any Tambahan — derived as a
// residual from the same shared, batched computation the breakdown UI
// uses, so this can never drift out of sync with what the UI shows.
export async function getUnclaimedQuantity(db: any, itemId: number): Promise<number> {
  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) return 0;

  const [stockRow] = await db
    .select({ quantity: locationStock.quantity })
    .from(locationStock)
    .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, itemId)));
  const total = stockRow?.quantity ?? 0;

  const { totalMarked } = await getMarkedBreakdownForItem(db, itemId);
  return total - totalMarked;
}