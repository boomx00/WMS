import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/location-stock/lookup?locationCode=A.1.1
export async function GET(req: NextRequest) {
  const locationCode = sanitize(req.nextUrl.searchParams.get("locationCode") ?? "");

  if (!locationCode) {
    return NextResponse.json({ error: "locationCode is required" }, { status: 400 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const rows = await db
    .select({
      itemId: items.id,
      itemSku: items.sku,
      itemName: items.name,
      palletCartonQty: items.palletCartonQty,
      quantity: locationStock.quantity,
    })
    .from(locationStock)
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(and(eq(locationStock.locationId, location.id), gt(locationStock.quantity, 0)));

  return NextResponse.json({
    locationCode: location.code,
    locationType: location.type,
    stock: rows,
  });
}