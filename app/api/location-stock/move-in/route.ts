import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents, locationStock } from "@/db/schema";
import { eq, or, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// PATCH /api/location-stock/move-in
// body: { label, destinationLocationCode, quantity }
//
// A scanned label here is only ever used to extract the SKU — this never
// touches the pallets table. Pallet ID tracking is exclusive to the real
// Inbound flow; Move In v2 operates purely on location_stock aggregates.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const rawLabel = sanitize(body.label ?? "");
  const destinationLocationCode = sanitize(body.destinationLocationCode ?? "");
  const { quantity } = body;

  if (!rawLabel || !destinationLocationCode || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "label, destinationLocationCode, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const label = await normalizeLabel(db, rawLabel);
  const sku = extractSku(label);
  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU from this label" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU in scanned label" }, { status: 404 });
  }

  const [floor] = await db.select().from(locations).where(eq(locations.type, "FLOOR"));
  if (!floor) {
    return NextResponse.json({ error: "No FLOOR location exists yet" }, { status: 500 });
  }

  const [destination] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, destinationLocationCode));
  if (!destination) {
    return NextResponse.json({ error: "Unknown destination location code" }, { status: 404 });
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  const allowNegative = settingsRow?.allowNegativeFloorStock ?? false;

  const [floorStockRow] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, floor.id), eq(locationStock.itemId, item.id)));
  const currentFloorQty = floorStockRow?.quantity ?? 0;

  if (!allowNegative && quantity > currentFloorQty) {
    return NextResponse.json(
      { error: `Insufficient stock: only ${currentFloorQty} of ${item.sku} tracked on Floor` },
      { status: 409 }
    );
  }

  const floorDecrement = Math.min(quantity, Math.max(currentFloorQty, 0));

  try {
    await db.transaction(async (tx) => {
      await adjustLocationStock(tx, floor.id, item.id, -floorDecrement);
      await adjustLocationStock(tx, destination.id, item.id, quantity);

      await tx.insert(locationStockEvents).values({
        type: "MOVE",
        itemId: item.id,
        sourceLocationId: floor.id,
        destinationLocationId: destination.id,
        quantity,
        userId: session.userId,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to move in";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    itemSku: item.sku,
    destinationLocationCode: destination.code,
    quantityMoved: quantity,
  });
}