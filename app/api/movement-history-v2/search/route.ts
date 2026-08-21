import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users, salesOrders } from "@/db/schema";
import { eq, desc, or, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

// GET /api/movement-history-v2/search?q=...
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  const rows = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      itemSku: items.sku,
      itemName: items.name,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: salesOrders.soNumber,
      quantity: locationStockEvents.quantity,
      username: users.username,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(
      or(
        ilike(items.sku, pattern),
        ilike(items.name, pattern),
        ilike(sourceLoc.code, pattern),
        ilike(destLoc.code, pattern),
        ilike(salesOrders.soNumber, pattern),
        ilike(users.username, pattern)
      )
    )
    .orderBy(desc(locationStockEvents.createdAt))
    .limit(200);

  return NextResponse.json(rows);
}