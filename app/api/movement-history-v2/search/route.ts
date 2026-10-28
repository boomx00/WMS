import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users, salesOrders, suppliers } from "@/db/schema";
import { eq, desc, or, and, ilike, gte, lt, inArray, sql } from "drizzle-orm";
import { asPhysicalMove, UNPICK_TYPE } from "@/lib/unpick";
import { alias } from "drizzle-orm/pg-core";
import { finalStockAtDestinationSql } from "@/lib/finalStock";
import { tambahanOrders } from "@/db/schema";
import { cleanTags, itemHasTag, sameText } from "@/lib/itemAttributes";
const sourceLoc = alias(locations, "source_loc");
// A movement's supplier: its own (production inbound = Production), else
// the product's.
const eventSupplierId = sql`coalesce(${locationStockEvents.supplierId}, ${items.supplierId})`;
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
  "OTHER_INBOUND",
  "OTHER_OUTBOUND",
  "DELETE_SO",
] as const;
type EventType = (typeof VALID_EVENT_TYPES)[number];

function asEventType(value: string): EventType | null {
  return (VALID_EVENT_TYPES as readonly string[]).includes(value) ? (value as EventType) : null;
}

// GET /api/movement-history-v2/search
//
// Two modes:
//   - Simple: ?q=... — one term, OR-matched across SKU/product/location/
//     document number (SO, Tambahan, MO)/user (the original quick-search behavior).
//   - Advanced: any of ?sku=&location=&user=&so=&type=&itemType=&brand=&tags=&supplierId=
//     — each provided field is ANDed together, so "sku=ABC&user=john" finds
//     events that match BOTH, not either. itemType / brand are the
//     product's Type / Brand (exact, ignoring case); tags is a
//     comma-separated list and the product must have every one of them.
//     supplierId: the event's own supplier (production inbound = Production),
//     otherwise the product's supplier.
//   Quick search also matches the product's Type, Brand and tags, and the supplier's name.
// If any advanced param is present, it takes priority over `q`.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const sku = params.get("sku")?.trim() ?? "";
  const location = params.get("location")?.trim() ?? "";
  const user = params.get("user")?.trim() ?? "";
  const so = params.get("so")?.trim() ?? "";
  const type = params.get("type")?.trim() ?? "";
  const itemType = params.get("itemType")?.trim() ?? "";
  const brand = params.get("brand")?.trim() ?? "";
  const tags = cleanTags(params.get("tags") ?? "");
  const supplierParam = params.get("supplierId")?.trim() ?? "";
  // "none" = movements with no supplier at all.
  const supplierId = supplierParam === "none" ? "none" : Number(supplierParam) > 0 ? Number(supplierParam) : null;
  // "UNPICK" isn't stored as its own type: it's a negative PICKING /
  // DEFAULT_PICKING (lib/unpick.ts). Picking filters leave un-picks out.
  const wantsUnpick = type === UNPICK_TYPE;
  const validatedType = type && !wantsUnpick ? asEventType(type) : null;
  const typeCondition = wantsUnpick
    ? and(inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING"]), lt(locationStockEvents.quantity, 0))
    : validatedType === "PICKING" || validatedType === "DEFAULT_PICKING"
      ? and(eq(locationStockEvents.type, validatedType), gte(locationStockEvents.quantity, 0))
      : validatedType
        ? eq(locationStockEvents.type, validatedType)
        : undefined;

  const isAdvanced = Boolean(
    sku || location || user || so || typeCondition || itemType || brand || tags.length > 0 || supplierId !== null
  );

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
                    so
            ? or(
                ilike(salesOrders.soNumber, `%${so}%`),
                ilike(locationStockEvents.deletedSoNumber, `%${so}%`),
                ilike(tambahanOrders.tambahanNumber, `%${so}%`),
                ilike(tambahanOrders.convertedSoNumber, `%${so}%`),
                ilike(locationStockEvents.workOrderNumber, `%${so}%`)
              )
            : undefined,
          typeCondition,
          itemType ? sameText(items.productType, itemType) : undefined,
          brand ? sameText(items.brand, brand) : undefined,
          ...tags.map((tag) => itemHasTag(tag)),
          supplierId === "none"
            ? sql`${eventSupplierId} is null`
            : supplierId !== null
              ? sql`${eventSupplierId} = ${supplierId}`
              : undefined,
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
          ilike(locationStockEvents.deletedSoNumber, pattern),
          ilike(locationStockEvents.workOrderNumber, pattern),
          ilike(tambahanOrders.tambahanNumber, pattern),
          ilike(tambahanOrders.convertedSoNumber, pattern),
          ilike(users.username, pattern),
          ilike(items.productType, pattern),
          ilike(items.brand, pattern),
          ilike(suppliers.name, pattern),
          itemHasTag(q)
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
      soNumber: sql<string | null>`coalesce(${salesOrders.soNumber}, ${locationStockEvents.deletedSoNumber})`,
      tambahanNumber: tambahanOrders.tambahanNumber,
      workOrderNumber: locationStockEvents.workOrderNumber,
      supplierName: suppliers.name,
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
        .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .leftJoin(suppliers, sql`${suppliers.id} = ${eventSupplierId}`)
    .where(whereClause)
    .orderBy(desc(locationStockEvents.createdAt))
    .limit(200);

  // Un-picks show as the move that physically happened (lib/unpick.ts).
  return NextResponse.json(rows.map((r) => asPhysicalMove(r, "sourceCode", "destinationCode")));
}