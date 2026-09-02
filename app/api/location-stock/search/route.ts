import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, or, ilike, ne, and, sql } from "drizzle-orm";

const MAX_RESULTS = 500;

// GET /api/location-stock/search?q=...
// Searches the whole location_stock table (not just whatever's currently
// loaded on the page) by location code, SKU, or product name. Applies
// the same "hide zero-quantity rows except at FLOOR" rule as the main
// page query, so search results stay consistent with the default view.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  const rows = await db
    .select({
      id: locationStock.id,
      locationCode: locations.code,
      locationType: locations.type,
      locationArea: locations.area,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStock.quantity,
      palletQuantity: sql<number>`
        ROUND(${locationStock.quantity}::numeric / NULLIF(${items.palletCartonQty}, 0), 2)
      `,
      updatedAt: locationStock.updatedAt,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(
      and(
        or(ilike(locations.code, pattern), ilike(items.sku, pattern), ilike(items.name, pattern)),
        or(eq(locations.type, "FLOOR"), ne(locationStock.quantity, 0))
      )
    )
    .orderBy(locations.code)
    .limit(MAX_RESULTS);

  return NextResponse.json(rows);
}