import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/pallets/correct-quantity
// body: { label, newQuantity, reason? }
//
// Corrects a specific, individually-tracked pallet's recorded quantity —
// for fixing a mistaken entry made during Inbound. Keeps location_stock in
// sync by applying the same delta, and logs the correction in both the
// pallet's own event history and the v2 location event log.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const rawLabel = sanitize(body.label ?? "");
  const reason = sanitize(body.reason ?? "");
  const { newQuantity } = body;

  if (!rawLabel || newQuantity === undefined || newQuantity < 0) {
    return NextResponse.json(
      { error: "label and a non-negative newQuantity are required" },
      { status: 400 }
    );
  }

  const label = await normalizeLabel(db, rawLabel);

  const [pallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.status, "ACTIVE")));

  if (!pallet) {
    return NextResponse.json(
      { error: "No active pallet found with that label" },
      { status: 404 }
    );
  }

  const delta = newQuantity - pallet.quantity;

  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current quantity" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const [updatedPallet] = await tx
      .update(pallets)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(pallets.id, pallet.id))
      .returning();

    // Keep the pallet's own event history in sync.
    await tx.insert(palletEvents).values({
      palletId: updatedPallet.id,
      type: "ADJUSTMENT",
      locationId: pallet.locationId,
      userId: session.userId,
      quantity: delta,
    });

    // Keep the v2 aggregate in sync — this is what actually drives
    // location_stock's live number.
    await adjustLocationStock(tx, pallet.locationId, pallet.itemId, delta);

    await tx.insert(locationStockEvents).values({
      type: "ADJUSTMENT",
      itemId: pallet.itemId,
      sourceLocationId: null,
      destinationLocationId: pallet.locationId,
      quantity: delta,
      userId: session.userId,
    });

    return updatedPallet;
  });

  return NextResponse.json({
    ...result,
    previousQuantity: pallet.quantity,
    delta,
    reason: reason || undefined,
  });
}