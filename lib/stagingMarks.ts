import { locationStockEvents, locations, settings } from "@/db/schema";
import { and, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";

// "Marked" stock = stock in a staging location that's set aside for one
// sales order (or Tambahan). It's tracked per staging location, from the
// stock events tagged with that order:
//
//   PICKING / DEFAULT_PICKING / CLAIM   + quantity at the destination
//   RELEASE (Finish; negative quantity) + quantity at the source
//   SHIP                                − quantity at the source
//   MOVE tagged with an order           − at the source, + at the destination
//                                         (marked stock moved between
//                                         staging locations)
//
// Summed over every location this is exactly the old per-order formula
// (PICKING + DEFAULT_PICKING + RELEASE + CLAIM − SHIP), since a tagged MOVE
// takes off at one location what it adds at the other.

// Settings → Locations & Marking. Off = staging stock is a shared pool:
// nothing counts as reserved for an order (getMarkedBreakdownForItem
// returns no marks, so all of it is "unmarked"), shipping isn't limited to
// the order's own picks, and claims / corrections / releases are off.
// The marks are still computed from the events, so turning it back on
// picks up where they stand.
export async function isMarkingEnabled(db: any): Promise<boolean> {
  const [row] = await db.select({ enabled: settings.markingEnabled }).from(settings).limit(1);
  return row?.enabled ?? true;
}

export const MARKING_OFF_ERROR = "Order marking is turned off (Settings → Locations & Marking)";

export type MarkRow = {
  salesOrderId: number | null;
  tambahanOrderId: number | null;
  locationId: number | null;
  quantity: number;
};

export type MarkFilter = {
  itemId: number;
  salesOrderIds?: number[];
  tambahanOrderIds?: number[];
  locationId?: number;
};

const ADD_AT_DESTINATION = sql`(${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'CLAIM')
  OR (${locationStockEvents.type} = 'MOVE' AND (${locationStockEvents.salesOrderId} IS NOT NULL OR ${locationStockEvents.tambahanOrderId} IS NOT NULL)))`;

const AT_SOURCE = sql`(${locationStockEvents.type} IN ('RELEASE', 'SHIP')
  OR (${locationStockEvents.type} = 'MOVE' AND (${locationStockEvents.salesOrderId} IS NOT NULL OR ${locationStockEvents.tambahanOrderId} IS NOT NULL)))`;

// RELEASE is stored negative and adds as-is; SHIP and tagged MOVE take off.
const SOURCE_DELTA = sql`CASE WHEN ${locationStockEvents.type} = 'RELEASE'
  THEN ${locationStockEvents.quantity} ELSE -${locationStockEvents.quantity} END`;

function orderScope(filter: MarkFilter): SQL {
  const parts: SQL[] = [];
  if (filter.salesOrderIds) {
    parts.push(
      filter.salesOrderIds.length > 0
        ? inArray(locationStockEvents.salesOrderId, filter.salesOrderIds)
        : sql`false`
    );
  }
  if (filter.tambahanOrderIds) {
    parts.push(
      filter.tambahanOrderIds.length > 0
        ? inArray(locationStockEvents.tambahanOrderId, filter.tambahanOrderIds)
        : sql`false`
    );
  }
  if (parts.length === 0) {
    return or(isNotNull(locationStockEvents.salesOrderId), isNotNull(locationStockEvents.tambahanOrderId))!;
  }
  return parts.length === 1 ? parts[0] : or(...parts)!;
}

// Net marked quantity per (order, location) for one item. Rows that net
// to zero are left out. locationId null = old events with no location
// (only before the receiving/staging migration backfilled them).
export async function getMarkRows(db: any, filter: MarkFilter): Promise<MarkRow[]> {
  const scope = and(eq(locationStockEvents.itemId, filter.itemId), orderScope(filter))!;

  const destWhere = filter.locationId
    ? and(scope, ADD_AT_DESTINATION, eq(locationStockEvents.destinationLocationId, filter.locationId))
    : and(scope, ADD_AT_DESTINATION);
  const sourceWhere = filter.locationId
    ? and(scope, AT_SOURCE, eq(locationStockEvents.sourceLocationId, filter.locationId))
    : and(scope, AT_SOURCE);

  const [added, atSource] = await Promise.all([
    db
      .select({
        salesOrderId: locationStockEvents.salesOrderId,
        tambahanOrderId: locationStockEvents.tambahanOrderId,
        locationId: locationStockEvents.destinationLocationId,
        quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
      })
      .from(locationStockEvents)
      .where(destWhere)
      .groupBy(
        locationStockEvents.salesOrderId,
        locationStockEvents.tambahanOrderId,
        locationStockEvents.destinationLocationId
      ),
    db
      .select({
        salesOrderId: locationStockEvents.salesOrderId,
        tambahanOrderId: locationStockEvents.tambahanOrderId,
        locationId: locationStockEvents.sourceLocationId,
        quantity: sql<number>`coalesce(sum(${SOURCE_DELTA}), 0)::int`,
      })
      .from(locationStockEvents)
      .where(sourceWhere)
      .groupBy(
        locationStockEvents.salesOrderId,
        locationStockEvents.tambahanOrderId,
        locationStockEvents.sourceLocationId
      ),
  ]);

  const byKey = new Map<string, MarkRow>();
  for (const row of [...added, ...atSource] as MarkRow[]) {
    const key = `${row.salesOrderId}|${row.tambahanOrderId}|${row.locationId}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += row.quantity;
    else byKey.set(key, { ...row });
  }
  return [...byKey.values()].filter((r) => r.quantity !== 0);
}

export type OrderRef = { salesOrderId: number } | { tambahanOrderId: number };

function scopeFor(order: OrderRef): Pick<MarkFilter, "salesOrderIds" | "tambahanOrderIds"> {
  return "salesOrderId" in order
    ? { salesOrderIds: [order.salesOrderId] }
    : { tambahanOrderIds: [order.tambahanOrderId] };
}

// How much of an item is marked for one order at one staging location.
export async function getMarkedAt(db: any, order: OrderRef, itemId: number, locationId: number): Promise<number> {
  const rows = await getMarkRows(db, { itemId, locationId, ...scopeFor(order) });
  return rows.reduce((sum, r) => sum + r.quantity, 0);
}

// Where an order's marked stock of an item sits: locationId -> quantity
// (only locations with a nonzero amount).
export async function getMarkedLocations(db: any, order: OrderRef, itemId: number): Promise<Map<number, number>> {
  const rows = await getMarkRows(db, { itemId, ...scopeFor(order) });
  const result = new Map<number, number>();
  for (const r of rows) {
    if (r.locationId === null) continue;
    result.set(r.locationId, (result.get(r.locationId) ?? 0) + r.quantity);
  }
  for (const [id, qty] of result) if (qty === 0) result.delete(id);
  return result;
}

// Where an order's stock of an item was originally picked from (location
// codes), for the stock now marked in one staging location — or in any
// staging location when locationId is left out. Follows marked stock moved
// between staging locations back to the picks that brought it in, so
// moving marked stock from Staging 1 to Staging 2 keeps showing the rack
// it came from.
export async function getPickOrigins(
  db: any,
  order: OrderRef,
  itemId: number,
  locationId?: number
): Promise<string[]> {
  const orderWhere =
    "salesOrderId" in order
      ? eq(locationStockEvents.salesOrderId, order.salesOrderId)
      : eq(locationStockEvents.tambahanOrderId, order.tambahanOrderId);

  const rows: { type: string; sourceId: number | null; destinationId: number | null; sourceCode: string | null; quantity: number }[] =
    await db
      .select({
        type: locationStockEvents.type,
        sourceId: locationStockEvents.sourceLocationId,
        destinationId: locationStockEvents.destinationLocationId,
        sourceCode: locations.code,
        quantity: locationStockEvents.quantity,
      })
      .from(locationStockEvents)
      .leftJoin(locations, eq(locations.id, locationStockEvents.sourceLocationId))
      .where(
        and(
          eq(locationStockEvents.itemId, itemId),
          orderWhere,
          sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING', 'MOVE')`
        )
      );

  // staging location id -> codes picked into it; and -> staging locations
  // marked stock was moved into it from
  const pickedInto = new Map<number, Set<string>>();
  const movedFrom = new Map<number, Set<number>>();
  for (const r of rows) {
    if (r.destinationId === null || r.sourceId === null) continue;
    if (r.type === "MOVE") {
      if (!movedFrom.has(r.destinationId)) movedFrom.set(r.destinationId, new Set());
      movedFrom.get(r.destinationId)!.add(r.sourceId);
    } else if (r.quantity > 0 && r.sourceCode) {
      if (!pickedInto.has(r.destinationId)) pickedInto.set(r.destinationId, new Set());
      pickedInto.get(r.destinationId)!.add(r.sourceCode);
    }
  }

  const start = locationId !== undefined ? [locationId] : [...new Set([...pickedInto.keys(), ...movedFrom.keys()])];
  const seen = new Set<number>();
  const origins = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const code of pickedInto.get(id) ?? []) origins.add(code);
    for (const from of movedFrom.get(id) ?? []) stack.push(from);
  }
  return [...origins].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
