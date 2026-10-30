// Server-only: a sales order's truck enter / leave times, worked out from
// the stock ledger (location_stock_events) instead of being typed in:
//
//   truck enter = the FIRST picking for the SO   (PICKING / DEFAULT_PICKING)
//   truck leave = the LAST shipping for the SO, including the shipping of
//                 its Tambahan batches             (SHIP)
//
// Only real picks and ships count (quantity > 0): un-picks are stored as a
// negative PICKING and shipment corrections as a negative SHIP, and neither
// is the truck doing anything. Tambahan events are stored against
// tambahan_order_id (not the SO) and are credited to the Tambahan's parent
// SO: its SHIPs can push truck leave later, its PICKINGs never change truck
// enter.
//
// Times come back as WIB (Asia/Jakarta) wall-clock strings
// "YYYY-MM-DD HH24:MI:SS" — the same shape the old hand-typed truck columns
// had — so format them with formatTruckTime() (sales-orders helpers), never
// new Date(). created_at is stored as UTC, hence the AT TIME ZONE pair.

import { locationStockEvents, tambahanOrders } from "@/db/schema";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

const TRUCK_TIME_ZONE = "Asia/Jakarta";
const TZ = sql.raw(`'${TRUCK_TIME_ZONE}'`);

export type TruckTimes = {
  truckEnterTime: string | null; // first pick, WIB wall-clock
  truckLeaveTime: string | null; // last ship, WIB wall-clock
  // truck leave − truck enter; null until both exist
  durationMs: number | null;
};

const e = locationStockEvents;
const t = tambahanOrders;

// Only the events that can set a truck time.
const PICK_OR_SHIP = sql`${e.type} IN ('PICKING', 'DEFAULT_PICKING', 'SHIP') AND ${e.quantity} > 0`;

// The SO an event counts for: its own SO, or its Tambahan's parent SO.
// (Needs the left join to tambahan_orders below.)
const OWNER_SO = sql<number>`coalesce(${e.salesOrderId}, ${t.parentSalesOrderId})`;

// Truck enter: the SO's own picks only — not its Tambahan's.
const FIRST_PICK = sql`min(${e.createdAt}) filter (where ${e.type} IN ('PICKING', 'DEFAULT_PICKING') AND ${e.salesOrderId} IS NOT NULL)`;
// Truck leave: the SO's own ships and its Tambahan's ships.
const LAST_SHIP = sql`max(${e.createdAt}) filter (where ${e.type} = 'SHIP')`;

function toWallClock(utc: SQL) {
  return sql<string | null>`to_char((${utc}) AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI:SS')`;
}

// A WIB wall-clock string ("YYYY-MM-DD HH:mm[:ss]") as the UTC timestamp
// it's stored as in created_at.
function wallClockToUtc(wall: string) {
  // Fully parenthesised: BETWEEN's bounds can't take a bare AT TIME ZONE.
  return sql`(((${wall})::timestamp AT TIME ZONE ${TZ}) AT TIME ZONE 'UTC')`;
}

function selectTruckTimes(db: any) {
  return db
    .select({
      salesOrderId: OWNER_SO.mapWith(Number),
      truckEnterTime: toWallClock(FIRST_PICK),
      truckLeaveTime: toWallClock(LAST_SHIP),
      durationMs: sql<number | null>`(extract(epoch from (${LAST_SHIP} - ${FIRST_PICK})) * 1000)::float8`,
    })
    .from(e)
    .leftJoin(t, eq(e.tambahanOrderId, t.id));
}

// Events of the given SOs, or of their Tambahan batches.
function ownedBy(salesOrderIds: number[] | SQL) {
  const tambahanOfThese = sql`(select ${t.id} from ${t} where ${t.parentSalesOrderId} in ${
    Array.isArray(salesOrderIds) ? sql`(${sql.join(salesOrderIds.map((id) => sql`${id}`), sql`, `)})` : salesOrderIds
  })`;
  return or(
    Array.isArray(salesOrderIds) ? inArray(e.salesOrderId, salesOrderIds) : sql`${e.salesOrderId} in ${salesOrderIds}`,
    sql`${e.tambahanOrderId} in ${tambahanOfThese}`
  );
}

type Row = { salesOrderId: number } & TruckTimes;

function toMap(rows: Row[]): Map<number, TruckTimes> {
  const map = new Map<number, TruckTimes>();
  for (const r of rows) {
    map.set(r.salesOrderId, {
      truckEnterTime: r.truckEnterTime,
      truckLeaveTime: r.truckLeaveTime,
      durationMs: r.durationMs == null ? null : Number(r.durationMs),
    });
  }
  return map;
}

export const NO_TRUCK_TIMES: TruckTimes = { truckEnterTime: null, truckLeaveTime: null, durationMs: null };

// Truck times for the given sales orders, in ONE query. SOs with no picks or
// ships yet are simply absent (use NO_TRUCK_TIMES).
export async function getTruckTimes(db: any, salesOrderIds: number[]): Promise<Map<number, TruckTimes>> {
  if (salesOrderIds.length === 0) return new Map();
  const rows: Row[] = await selectTruckTimes(db)
    .where(and(ownedBy(salesOrderIds), PICK_OR_SHIP))
    .groupBy(OWNER_SO);
  return toMap(rows);
}

// Every sales order whose truck entered (first pick) OR left (last ship)
// inside a WIB wall-clock window — e.g. "2026-10-22 08:00:00" to
// "2026-10-29 17:59:59.999". Bounds are inclusive.
export async function getTruckTimesInWindow(
  db: any,
  startWall: string,
  endWall: string
): Promise<Map<number, TruckTimes>> {
  const from = wallClockToUtc(startWall);
  const to = wallClockToUtc(endWall);

  // An SO whose first pick or last ship is in the window must have a pick
  // or ship (its own or its Tambahan's) in the window, so narrow to those
  // first (uses the created_at index) before working out each one's first /
  // last over all its events.
  const touched = sql`(select distinct ${OWNER_SO} from ${e} left join ${t} on ${e.tambahanOrderId} = ${t.id} where ${and(
    PICK_OR_SHIP,
    sql`${e.createdAt} BETWEEN ${from} AND ${to}`
  )} and ${OWNER_SO} is not null)`;

  const rows: Row[] = await selectTruckTimes(db)
    .where(and(ownedBy(touched), PICK_OR_SHIP))
    .groupBy(OWNER_SO)
    .having(sql`(${FIRST_PICK} BETWEEN ${from} AND ${to}) OR (${LAST_SHIP} BETWEEN ${from} AND ${to})`);
  return toMap(rows);
}
