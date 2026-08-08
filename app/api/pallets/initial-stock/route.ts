import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations, items, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// POST /api/pallets/initial-stock
// body: { defaultCode, locationCode, quantity }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  if (settingsRow && !settingsRow.allowDefaultCodeTransactions) {
    return NextResponse.json(
      { error: "Default-code transactions are currently disabled in Settings" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { defaultCode, locationCode, quantity } = body;

  if (!defaultCode || !locationCode || !quantity) {
    return NextResponse.json(
      { error: "defaultCode, locationCode, and quantity are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.defaultCode, defaultCode));
  if (!item) {
    return NextResponse.json({ error: "Unknown default code" }, { status: 404 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const result = await db.transaction(async (tx) => {
    // If this SKU's default code already has an active pallet at this exact
    // location, accumulate onto it instead of creating a duplicate row.
    const [existing] = await tx
      .select()
      .from(pallets)
      .where(and(eq(pallets.label, defaultCode), eq(pallets.locationId, location.id)));

    let pallet;
    if (existing && existing.status === "ACTIVE") {
      [pallet] = await tx
        .update(pallets)
        .set({ quantity: existing.quantity + quantity, updatedAt: new Date() })
        .where(eq(pallets.id, existing.id))
        .returning();
    } else if (existing && existing.status === "REMOVED") {
      // Revive a previously-emptied bucket rather than inserting a duplicate
      // (label, locationId) row, which the unique index would reject.
      [pallet] = await tx
        .update(pallets)
        .set({
          status: "ACTIVE",
          quantity,
          removedAt: null,
          inboundUserId: session.userId,
          updatedAt: new Date(),
        })
        .where(eq(pallets.id, existing.id))
        .returning();
    } else {
      [pallet] = await tx
        .insert(pallets)
        .values({
          label: defaultCode,
          itemId: item.id,
          workOrderNumber: "INITIAL-STOCK",
          quantity,
          locationId: location.id,
          inboundUserId: session.userId,
          firstRackedAt: location.type === "RACK" ? new Date() : null,
        })
        .returning();
    }

    await tx.insert(palletEvents).values({
      palletId: pallet.id,
      type: "INBOUND",
      locationId: location.id,
      userId: session.userId,
      quantity,
    });

    return pallet;
  });

  return NextResponse.json(result, { status: 201 });
}