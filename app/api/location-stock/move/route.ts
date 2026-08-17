import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock, moveLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/move
// body: { sourceLocationCode, destinationLocationCode, itemSku, quantity, sourceUntracked? }
//
// Moves stock between two locations purely by SKU + aggregate quantity —
// no pallet label required. sourceUntracked=true is for pre-existing rack
// stock that was never entered into the system (mirrors Picking v2's
// default-picking behavior): only credits the destination, doesn't try to
// decrement a source balance that was never recorded.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const sourceLocationCode = sanitize(body.sourceLocationCode ?? "");
  const destinationLocationCode = sanitize(body.destinationLocationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const { quantity, sourceUntracked } = body;

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

  if (sourceUntracked) {
    const [settingsRow] = await db.select().from(settings).limit(1);
    if (settingsRow && !settingsRow.allowDefaultPicking) {
      return NextResponse.json(
        { error: "Default picking/moving is currently disabled in Settings" },
        { status: 403 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (sourceUntracked) {
        await adjustLocationStock(tx, destinationLocation.id, item.id, quantity);
        await tx.insert(locationStockEvents).values({
          type: "DEFAULT_MOVE",
          itemId: item.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: destinationLocation.id,
          quantity,
          userId: session.userId,
        });
      } else {
        await moveLocationStock(tx, sourceLocation.id, destinationLocation.id, item.id, quantity);
        await tx.insert(locationStockEvents).values({
          type: "MOVE",
          itemId: item.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: destinationLocation.id,
          quantity,
          userId: session.userId,
        });
      }
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
  });
}