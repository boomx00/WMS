import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, items } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { getLocationByCode } from "@/lib/locationRules";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/location-stock/lookup?locationCode=A.1.1
// The location's stock, plus its type's rules and whether it's a receiving
// / staging location, so the PDA can decide how to treat it (one SKU only?
// tally counting? Default Picking?) without comparing type codes like
// "RACK" or "FLOOR".
// locationType stays for older PDA builds that still compare it.
export async function GET(req: NextRequest) {
  const locationCode = sanitize(req.nextUrl.searchParams.get("locationCode") ?? "");

  if (!locationCode) {
    return NextResponse.json({ error: "locationCode is required" }, { status: 400 });
  }

  const location = await getLocationByCode(db, locationCode);
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
    typeName: location.rules.name,
    allowsMultipleSku: location.rules.allowsMultipleSku,
    hasPosition: location.rules.hasPosition,
    pickable: location.rules.pickable,
    isReceiving: location.isReceiving,
    isStaging: location.isStaging,
    stock: rows,
  });
}
