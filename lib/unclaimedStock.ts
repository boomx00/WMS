import { locationStock } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getMarkedBreakdownForItem } from "@/lib/markedStock";
import { getStagingLocationIds } from "@/lib/locationRules";

// Physical stock of an item at one staging location, or across every
// staging location when locationId is left out.
export async function getStagingTotal(db: any, itemId: number, locationId?: number): Promise<number> {
  const locationIds = locationId ? [locationId] : await getStagingLocationIds(db);
  if (locationIds.length === 0) return 0;

  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int` })
    .from(locationStock)
    .where(and(inArray(locationStock.locationId, locationIds), eq(locationStock.itemId, itemId)));
  return row?.total ?? 0;
}

// "Unmarked" (ecer) = physical stock minus everything legitimately marked
// to an open SO or any Tambahan — at one staging location, or across all
// of them. Derived as a residual from the same shared computation the
// breakdown UI uses, so the two can never drift out of sync.
export async function getUnclaimedQuantity(db: any, itemId: number, locationId?: number): Promise<number> {
  const total = await getStagingTotal(db, itemId, locationId);
  const { totalMarked } = await getMarkedBreakdownForItem(db, itemId, locationId);
  return total - totalMarked;
}
