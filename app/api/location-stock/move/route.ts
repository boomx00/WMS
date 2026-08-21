import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents, locationStock } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/move
// body: { sourceLocationCode, destinationLocationCode, itemSku, quantity }
//
// Rules (governed by "Default Move" / allowNegativeRackStock setting):
//   - Source occupied by a DIFFERENT SKU → always blocked, setting has no effect.
//   - Same SKU present, sufficient quantity → always allowed (MOVE).
//   - Same SKU present but NOT enough, OR source genuinely empty:
//       setting ON  → allowed, source clamped to exactly 0, logged as DEFAULT_MOVE.
//       setting OFF → blocked with a clear insufficient-stock error.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const sourceLocationCode = sanitize(body.sourceLocationCode ?? "");
  const destinationLocationCode = sanitize(body.destinationLocationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const { quantity } = body;

  if (!sourceLocationCode || !destinationLocationCode || !itemSku || !quantity || quantity <= 0) {
    return NextResponse.json(
      {
        error:
          "sourceLocationCode, destinationLocationCode, itemSku, and a positive quantity are required",
      },
      { status: 400 }
    );
  }

  const [sourceLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, sourceLocationCode));
  if (!sourceLocation) {
    return NextResponse.json({ error: "Unknown source location code" }, { status: 404 });
  }

  const [destinationLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, destinationLocationCode));
  if (!destinationLocation) {
    return NextResponse.json({ error: "Unknown destination location code" }, { status: 404 });
  }

  if (sourceLocation.id === destinationLocation.id) {
    return NextResponse.json({ error: "Source and destination are the same location" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const allStockAtSource = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, sourceLocation.id));

  const matchingRow = allStockAtSource.find((r) => r.itemId === item.id);
  const occupiedByOther = allStockAtSource.some((r) => r.itemId !== item.id && r.quantity > 0);

  // Only RACK cells are single-SKU by design.
  if (sourceLocation.type === "RACK" && occupiedByOther) {
    return NextResponse.json(
      { error: `${sourceLocationCode} sudah berisi SKU lain, bukan ${itemSku}` },
      { status: 409 }
    );
  }

  const availableAtSource = matchingRow?.quantity ?? 0;
  const sufficient = quantity <= availableAtSource;

  let eventType: "MOVE" | "DEFAULT_MOVE" = "MOVE";

  if (!sufficient) {
    const [settingsRow] = await db.select().from(settings).limit(1);
    if (!settingsRow?.allowNegativeRackStock) {
      return NextResponse.json(
        {
          error:
            availableAtSource === 0
              ? `No stock recorded at ${sourceLocationCode} for ${itemSku}. Enable Default Move in Settings to allow this.`
              : `Only ${availableAtSource} of ${itemSku} available at ${sourceLocationCode}. Enable Default Move in Settings to allow taking more.`,
        },
        { status: 409 }
      );
    }
    eventType = "DEFAULT_MOVE";
  }

  const sourceDecrement = Math.min(quantity, Math.max(availableAtSource, 0));

  try {
    await db.transaction(async (tx) => {
      await adjustLocationStock(tx, sourceLocation.id, item.id, -sourceDecrement);
      await adjustLocationStock(tx, destinationLocation.id, item.id, quantity);

      await tx.insert(locationStockEvents).values({
        type: eventType,
        itemId: item.id,
        sourceLocationId: sourceLocation.id,
        destinationLocationId: destinationLocation.id,
        quantity,
        userId: session.userId,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to move";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    sourceLocationCode: sourceLocation.code,
    destinationLocationCode: destinationLocation.code,
    itemSku: item.sku,
    quantityMoved: quantity,
    matchType: eventType === "DEFAULT_MOVE" ? "default_move" : "exact",
  });
}