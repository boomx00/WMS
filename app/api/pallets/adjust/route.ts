import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/pallets/adjust
// body: { label, locationCode, newQuantity, reason? }
// Directly corrects a pallet's quantity — for stock-count discrepancies,
// data entry mistakes, etc. Logs an ADJUSTMENT event with the signed delta.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const label = await normalizeLabel(db, sanitize(body.label ?? ""));
  const locationCode = sanitize(body.locationCode ?? "");
  const reason = sanitize(body.reason ?? "");
  const { newQuantity } = body;

  if (!label || !locationCode || newQuantity === undefined || newQuantity < 0) {
    return NextResponse.json(
      { error: "label, locationCode, and a non-negative newQuantity are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [pallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.locationId, location.id)));

  if (!pallet) {
    return NextResponse.json(
      { error: "No pallet with that label found at that location" },
      { status: 404 }
    );
  }

  if (pallet.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Only active pallets can be adjusted (current status: ${pallet.status})` },
      { status: 409 }
    );
  }

  const delta = newQuantity - pallet.quantity;

  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current quantity" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(pallets)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(pallets.id, pallet.id))
      .returning();

    await tx.insert(palletEvents).values({
      palletId: updated.id,
      type: "ADJUSTMENT",
      locationId: location.id,
      userId: session.userId,
      quantity: delta, // signed — positive for increase, negative for decrease
    });

    return updated;
  });

  return NextResponse.json({
    ...result,
    previousQuantity: pallet.quantity,
    delta,
    reason: reason || undefined,
  });
}