import { pallets } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { isSingleSku, type LocationTypeRules } from "@/lib/locationRules";

// Enforces "only one SKU per location" for v1 pallets. Returns an error
// message if placing this item at this location would violate that, or
// null if it's fine. Only enforced for location types set to "Only 1 SKU"
// on the Locations page (today: RACK) — other types can hold mixed products.
export async function checkRackSkuConflict(
  db: any,
  location: { id: number; rules: Pick<LocationTypeRules, "allowsMultipleSku"> },
  itemId: number
): Promise<string | null> {
  if (!isSingleSku(location.rules)) return null;

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
