import { locationStock, locations, items } from "@/db/schema";
import { eq, and, ne, gt } from "drizzle-orm";

const MAX_PALLETS_PER_RACK_CELL = 14;

// Adjusts location_stock by `delta` for (locationId, itemId). Creates the
// row if it doesn't exist. Enforces two rules for RACK cells specifically:
//   1. Only one SKU per cell.
//   2. No more than MAX_PALLETS_PER_RACK_CELL pallets' worth of stock,
//      computed as quantity / item.palletCartonQty.
// `allowNegative` lets the resulting quantity go below zero instead of
// throwing on removal — used for Move In v2 when the relevant setting
// permits it. It has no bearing on the two RACK caps above.
export async function adjustLocationStock(
  tx: any,
  locationId: number,
  itemId: number,
  delta: number,
  allowNegative: boolean = false
): Promise<void> {
  const [location] = await tx.select().from(locations).where(eq(locations.id, locationId));
  if (!location) throw new Error("Location not found");

  const [existing] = await tx
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, locationId), eq(locationStock.itemId, itemId)));

if (location.type === "RACK" && delta > 0) {
  const [conflict] = await tx
    .select()
    .from(locationStock)
    .where(
      and(
        eq(locationStock.locationId, locationId),
        ne(locationStock.itemId, itemId),
        gt(locationStock.quantity, 0)
      )
    )
    .limit(1);
  if (conflict) {
    throw new Error(
      "RAK INI SUDAH MEMILIKI SKU LAINNYA"
    );
  }

    const [item] = await tx.select().from(items).where(eq(items.id, itemId));
    if (item && item.palletCartonQty > 0) {
      const currentQty = existing?.quantity ?? 0;
      const newQty = currentQty + delta;
      const newPalletCount = newQty / item.palletCartonQty;
      if (newPalletCount > MAX_PALLETS_PER_RACK_CELL) {
        throw new Error(
          `This would put ${newPalletCount.toFixed(1)} pallets in this cell — the maximum is ${MAX_PALLETS_PER_RACK_CELL}.`
        );
      }
    }
  }

if (existing) {
  const newQty = existing.quantity + delta;

  if (delta < 0 && newQty < 0 && !allowNegative) {
    throw new Error(`Insufficient stock: tried to remove ${-delta}, only ${existing.quantity} available`);
  }

  if (newQty === 0) {
    // Delete rather than leave a lingering zero row — otherwise a
    // different SKU added to this same location later creates a second
    // row instead of cleanly replacing this one.
    await tx.delete(locationStock).where(eq(locationStock.id, existing.id));
  } else {
    await tx
      .update(locationStock)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(eq(locationStock.id, existing.id));
  }
} else {
    if (delta < 0 && !allowNegative) {
      throw new Error("Insufficient stock: no existing stock at this location for this item");
    }
    await tx.insert(locationStock).values({ locationId, itemId, quantity: delta });
  }
}

export async function moveLocationStock(
  tx: any,
  sourceLocationId: number,
  destinationLocationId: number,
  itemId: number,
  quantity: number,
  allowNegativeSource: boolean = false
): Promise<void> {
  await adjustLocationStock(tx, sourceLocationId, itemId, -quantity, allowNegativeSource);
  await adjustLocationStock(tx, destinationLocationId, itemId, quantity);
}