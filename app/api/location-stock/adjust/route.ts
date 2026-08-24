import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, locationStock, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/adjust
// body: { locationCode, itemSku, newQuantity, reason? }
// Directly sets location_stock's quantity for (location, item) to
// newQuantity — for stock-count corrections, data entry mistakes, etc.
// Logs the signed delta as an ADJUSTMENT event.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const reason = sanitize(body.reason ?? "");
  const { newQuantity } = body;

  if (!locationCode || !itemSku || newQuantity === undefined) {
    return NextResponse.json(
      { error: "locationCode, itemSku, and newQuantity are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));

  const previousQuantity = existing?.quantity ?? 0;
  const delta = newQuantity - previousQuantity;

  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current quantity" }, { status: 400 });
  }

await db.transaction(async (tx) => {
  if (existing) {
    if (newQuantity === 0) {
      // Delete rather than leave a lingering zero row — otherwise a
      // different SKU added to this same location later creates a
      // duplicate instead of cleanly replacing this one.
      await tx.delete(locationStock).where(eq(locationStock.id, existing.id));
    } else {
      await tx
        .update(locationStock)
        .set({ quantity: newQuantity, updatedAt: new Date() })
        .where(eq(locationStock.id, existing.id));
    }
  } else {
    await tx.insert(locationStock).values({ locationId: location.id, itemId: item.id, quantity: newQuantity });
  }

  await tx.insert(locationStockEvents).values({
    type: "ADJUSTMENT",
    itemId: item.id,
    sourceLocationId: null,
    destinationLocationId: location.id,
    quantity: delta,
    userId: session.userId,
  });
});

  return NextResponse.json({
    locationCode: location.code,
    itemSku: item.sku,
    previousQuantity,
    newQuantity,
    delta,
    reason: reason || undefined,
  });
}