import { pallets } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

// Enforces "only one SKU per rack cell". Returns an error message if placing
// this item at this location would violate that, or null if it's fine.
// Only enforced for RACK-type locations — Floor/Leftover/Destroy can hold
// mixed products.
export async function checkRackSkuConflict(
  db: any,
  location: { id: number; type: string },
  itemId: number
): Promise<string | null> {
  if (location.type !== "RACK") return null;

  const [conflict] = await db
    .select({ itemId: pallets.itemId })
    .from(pallets)
    .where(
      and(
        eq(pallets.locationId, location.id),
        eq(pallets.status, "ACTIVE"),
        ne(pallets.itemId, itemId)
      )
    )
    .limit(1);

  if (conflict) {
    return "This rack location already holds a different product. Only one SKU can be stored per rack cell.";
  }

  return null;
}