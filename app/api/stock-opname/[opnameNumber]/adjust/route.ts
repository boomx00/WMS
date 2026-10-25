import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, locationStock, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/stock-opname/:opnameNumber/adjust-line
// body: { locationCode, itemId, countedQty }
//
// A single-row version of the bulk /adjust endpoint's logic: sets
// location_stock for this exact (location, item) pair to countedQty,
// computed as a delta from whatever's currently there, and logs an
// ADJUSTMENT event. It only ever touches the counted item itself — same
// as the bulk endpoint, it never touches any other item that might be
// recorded at that location. Unlike the bulk endpoint, this doesn't
// require the session to be marked DONE first, since it's a deliberate
// one-row correction the admin is choosing to apply right now.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  await params; // opnameNumber isn't needed for the write itself, but keeps this route scoped under the session for clarity

  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const itemId = Number(body.itemId);
  const countedQty = Number(body.countedQty);

  if (!locationCode || !itemId || isNaN(countedQty) || countedQty < 0) {
    return NextResponse.json(
      { error: "locationCode, itemId, and a non-negative countedQty are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) {
    return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  }

  const [stockRow] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, itemId)));

  const currentQty = stockRow?.quantity ?? 0;
  const delta = countedQty - currentQty;

  if (delta === 0) {
    return NextResponse.json({
      locationCode: location.code,
      itemSku: item.sku,
      previousQuantity: currentQty,
      newQuantity: countedQty,
      delta: 0,
      message: "Already matches — no change made.",
    });
  }

  await db.transaction(async (tx) => {
    await adjustLocationStock(tx, location.id, itemId, delta);

    await tx.insert(locationStockEvents).values({
      type: "ADJUSTMENT",
      itemId,
      sourceLocationId: null,
      destinationLocationId: location.id,
      quantity: delta,
      userId: session.userId,
    });
  });

  return NextResponse.json({
    locationCode: location.code,
    itemSku: item.sku,
    previousQuantity: currentQty,
    newQuantity: countedQty,
    delta,
  });
}