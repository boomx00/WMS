import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// PATCH /api/pallets/confirm-inbound
// body: { label, locationCode }
// An operator scans a PENDING pallet's label and the location it's actually
// being placed at, activating it as real stock.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const { label, locationCode } = body;

  if (!label || !locationCode) {
    return NextResponse.json({ error: "label and locationCode are required" }, { status: 400 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [pallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.status, "PENDING")));

  if (!pallet) {
    return NextResponse.json(
      { error: "No pending pallet found with that label" },
      { status: 404 }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(pallets)
      .set({
        status: "ACTIVE",
        locationId: location.id, // use where it was actually scanned, not just the admin's original plan
        firstRackedAt: location.type === "RACK" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(pallets.id, pallet.id))
      .returning();

    await tx.insert(palletEvents).values({
      palletId: updated.id,
      type: "CONFIRMED",
      locationId: location.id,
      userId: session.userId,
      quantity: pallet.quantity,
    });

    return updated;
  });

  return NextResponse.json(result);
}