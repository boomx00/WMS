import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users, salesOrders } from "@/db/schema";
import { eq, desc, or, and, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { finalStockAtDestinationSql } from "@/lib/finalStock";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

// Mirrors the locationStockEvents.type pgEnum in the schema. Query params
// are always plain strings, so this list is used to validate + narrow the
// value before passing it to eq(), which otherwise won't accept a bare
// `string` for an enum column.
const VALID_EVENT_TYPES = [
  "INBOUND",
  "DEFAULT_INBOUND",
  "ADJUSTMENT",
  "PICKING",
  "DEFAULT_PICKING",
  "SHIP",
  "MOVE",
  "DEFAULT_MOVE",
  "RELEASE",
  "CLAIM",
] as const;
type EventType = (typeof VALID_EVENT_TYPES)[number];

function asEventType(value: string): EventType | null {
  return (VALID_EVENT_TYPES as readonly string[]).includes(value) ? (value as EventType) : null;
}

// GET /api/movement-history-v2/search
//
// Two modes:
//   - Simple: ?q=... — one term, OR-matched across SKU/product/location/
//     SO/user (the original quick-search behavior).
//   - Advanced: any of ?sku=&location=&user=&so=&type= — each provided
//     field is ANDed together, so "sku=ABC&user=john" finds events that
//     match BOTH, not either.
// If any advanced param is present, it takes priority over `q`.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const sku = params.get("sku")?.trim() ?? "";
  const location = params.get("location")?.trim() ?? "";
  const user = params.get("user")?.trim() ?? "";
  const so = params.get("so")?.trim() ?? "";
  const type = params.get("type")?.trim() ?? "";
  const validatedType = type ? asEventType(type) : null;

  const isAdvanced = Boolean(sku || location || user || so || validatedType);

  if (!q && !isAdvanced) {
    return NextResponse.json([]);
  }

  const whereClause = isAdvanced
    ? and(
        ...[
          sku ? or(ilike(items.sku, `%${sku}%`), ilike(items.name, `%${sku}%`)) : undefined,
          location
            ? or(ilike(sourceLoc.code, `%${location}%`), ilike(destLoc.code, `%${location}%`))
            : undefined,
          user ? ilike(users.username, `%${user}%`) : undefined,
          so ? ilike(salesOrders.soNumber, `%${so}%`) : undefined,
          validatedType ? eq(locationStockEvents.type, validatedType) : undefined,
        ].filter((c): c is NonNullable<typeof c> => c !== undefined)
      )
    : (() => {
        const pattern = `%${q}%`;
        return or(
          ilike(items.sku, pattern),
          ilike(items.name, pattern),
          ilike(sourceLoc.code, pattern),
          ilike(destLoc.code, pattern),
          ilike(salesOrders.soNumber, pattern),
          ilike(users.username, pattern)
        );
      })();

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
      finalStock: finalStockAtDestinationSql,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(whereClause)
    .orderBy(desc(locationStockEvents.createdAt))
    .limit(200);

  return NextResponse.json(rows);
}