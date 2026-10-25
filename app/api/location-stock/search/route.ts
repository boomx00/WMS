import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, locationTypes, items } from "@/db/schema";
import { eq, or, ilike, ne, and, sql } from "drizzle-orm";
import { parseWarehouseId } from "@/lib/warehouses";

const MAX_RESULTS = 500;

// GET /api/location-stock/search?q=...[&warehouseId=N]
// Searches the whole location_stock table (not just whatever's currently
// loaded on the page) by location code, SKU, or product name. Applies
// the same "hide zero-quantity rows except in open pick areas" rule as the
// main page query, so search results stay consistent with the default view.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
  const warehouseId = parseWarehouseId(req.nextUrl.searchParams.get("warehouseId"));

  const rows = await db
    .select({
      id: locationStock.id,
      locationCode: locations.code,
      locationType: locations.type,
      locationArea: locations.area,
      isStaging: locations.isStaging,
      warehouseId: locations.warehouseId,
      typeName: locationTypes.name,
      typeOrder: locationTypes.sortOrder,
      hasPosition: locationTypes.hasPosition,
      pickable: locationTypes.pickable,
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
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(
      and(
        or(ilike(locations.code, pattern), ilike(items.sku, pattern), ilike(items.name, pattern)),
        or(
          and(eq(locationTypes.pickable, true), eq(locationTypes.hasPosition, false)),
          ne(locationStock.quantity, 0)
        ),
        warehouseId === null ? undefined : eq(locations.warehouseId, warehouseId)
      )
    )
    .orderBy(locations.code)
    .limit(MAX_RESULTS);

  return NextResponse.json(rows);
}