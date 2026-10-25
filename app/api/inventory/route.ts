import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq, ne } from "drizzle-orm";

// GET /api/inventory - active pallets (ON_FLOOR or RACKED), joined with item + location info
export async function GET() {
  const rows = await db
    .select({
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      status: pallets.status,
      workOrderNumber: pallets.workOrderNumber,
      updatedAt: pallets.updatedAt,

      itemSku: items.sku,
      itemName: items.name,

      locationCode: locations.code,
      locationType: locations.type,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(eq(pallets.status, "ACTIVE"))

  return NextResponse.json(rows);
}