import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { palletEvents, pallets, items, locations, users } from "@/db/schema";
import { eq, desc, or, ilike, and, inArray  } from "drizzle-orm";

// GET /api/transactions/search?q=...
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  const rows = await db
    .select({
      eventId: palletEvents.id,
      type: palletEvents.type,
      createdAt: palletEvents.createdAt,
      locationCode: locations.code,
      palletLabel: pallets.label,
      workOrderNumber: pallets.workOrderNumber,
      quantity: palletEvents.quantity,
      itemSku: items.sku,
      itemName: items.name,
      username: users.username,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(palletEvents.locationId, locations.id))
    .innerJoin(users, eq(palletEvents.userId, users.id))
.where(
  and(
    inArray(palletEvents.type, ["INBOUND", "DEFAULT_INBOUND"]),
    or(
      ilike(pallets.label, pattern),
      ilike(items.sku, pattern),
      ilike(items.name, pattern),
      ilike(pallets.workOrderNumber, pattern),
      ilike(locations.code, pattern),
      ilike(users.username, pattern)
    )
  )
)
    .orderBy(desc(palletEvents.createdAt))
    .limit(500);

  return NextResponse.json(rows);
}