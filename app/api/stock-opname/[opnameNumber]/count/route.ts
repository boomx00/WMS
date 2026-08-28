import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameItems, stockOpnameLocations, locations, items, locationStock } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// PATCH /api/stock-opname/:opnameNumber/count
// body: { locationCode, scanned, countedQty }
//
// Alongside the blind physical count, this also snapshots whatever
// location_stock says is there for this exact location+item *at the
// moment of counting* — so the recorded line always reflects what the
// system believed at count time, not whatever it happens to say later
// (e.g. after other movements land). difference = countedQty - systemQty,
// recomputed every time a line is (re)counted.
//
// If this location isn't yet part of this opname session (e.g. a custom,
// real-time session where locations are never pre-planned — only
// discovered as the PIC actually visits them), it's registered into
// stock_opname_locations automatically here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;
  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const rawScanned = sanitize(body.scanned ?? "");
  const { countedQty } = body;

  if (!locationCode || !rawScanned || countedQty === undefined || countedQty < 0) {
    return NextResponse.json(
      { error: "locationCode, scanned, and a non-negative countedQty are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const label = await normalizeLabel(db, rawScanned);
  const sku = extractSku(label);
  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  // Register this location into the session if it isn't already part of
  // it — this is what makes a custom/real-time session grow as the PIC
  // physically visits places, rather than needing a pre-planned list.
  const [existingLocationLink] = await db
    .select()
    .from(stockOpnameLocations)
    .where(
      and(
        eq(stockOpnameLocations.opnameNumber, opnameNumber),
        eq(stockOpnameLocations.locationId, location.id)
      )
    );

  if (!existingLocationLink) {
    await db.insert(stockOpnameLocations).values({ opnameNumber, locationId: location.id });
  }

  // Snapshot the live system quantity for this exact location+item right
  // now — this is the number the count is being checked against.
  const [stockRow] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));

  const systemQty = stockRow?.quantity ?? 0;
  const difference = countedQty - systemQty;

  const [existingLine] = await db
    .select()
    .from(stockOpnameItems)
    .where(
      and(
        eq(stockOpnameItems.opnameNumber, opnameNumber),
        eq(stockOpnameItems.locationId, location.id),
        eq(stockOpnameItems.itemId, item.id)
      )
    );

  let result;
  if (existingLine) {
    [result] = await db
      .update(stockOpnameItems)
      .set({ systemQty, countedQty, difference, countedAt: new Date(), countedBy: session.userId })
      .where(eq(stockOpnameItems.id, existingLine.id))
      .returning();
  } else {
    [result] = await db
      .insert(stockOpnameItems)
      .values({
        opnameNumber,
        locationId: location.id,
        itemId: item.id,
        systemQty,
        countedQty,
        difference,
        countedAt: new Date(),
        countedBy: session.userId,
      })
      .returning();
  }

  return NextResponse.json({ ...result, itemSku: item.sku, itemName: item.name, locationCode: location.code });
}