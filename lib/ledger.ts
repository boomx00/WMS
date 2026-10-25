// Shared by both Total Stock ledger endpoints (per-SKU and per-location) so
// they agree on the same start date, delta rules, and display timezone.
//
// Server-only: getLedgerStartAt() reads the DB. Don't import this file from
// client components.

import { db } from "@/lib/db";
import { settings } from "@/db/schema";

// Fallback used when Settings → Ledger start hasn't been set yet.
// Sept 21 2026, 00:00 Jakarta/Bangkok time (both UTC+7) = Sept 20 2026,
// 17:00 UTC.
export const DEFAULT_LEDGER_START_AT = new Date("2026-09-20T17:00:00.000Z");

// Every ledger is shown from this same moment forward, not from whenever it
// happened to first be viewed. Configurable on the Settings page.
export async function getLedgerStartAt(): Promise<Date> {
  const [row] = await db.select({ ledgerStartAt: settings.ledgerStartAt }).from(settings).limit(1);
  return row?.ledgerStartAt ?? DEFAULT_LEDGER_START_AT;
}

// Display timezone for everything shown in the ledger UI — currently
// hardcoded to Jakarta/Bangkok (UTC+7). All underlying storage and
// business-logic math (ledger start, date-range filtering) stays in UTC;
// only final display strings go through this offset. If this WMS is ever
// deployed for a client in a different timezone, this is the one constant
// that needs to change.
export const DISPLAY_TZ_OFFSET_HOURS = 7;

export function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Renders an absolute instant (a JS Date, always UTC internally) as a
// 24-hour "YYYY-MM-DD HH:MM" string in the display timezone — NOT UTC.
// Used for anything the ledger UI shows directly to the person.
export function formatLocalDateTime(d: Date): string {
  const shifted = new Date(d.getTime() + DISPLAY_TZ_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16).replace("T", " ");
}

// Whether an event physically moves stock. RELEASE (Finish on a sales
// order) only hands leftover picked stock back to the unmarked pool — it
// stays in the Outbound location. It's logged from that location to
// nowhere with a negative quantity, so counted as a movement it would look
// like stock arriving. The ledgers still list it, as a row that leaves the
// balance unchanged.
export function movesStock(type: string): boolean {
  return type !== "RELEASE";
}

// Whether an event changes a SKU's TOTAL stock (summed across every
// location that counts toward Total Stock): pass whether the source and
// destination are inside that total. Dest-only = entering (+quantity),
// source-only = leaving (-quantity), both or neither = no net change.
export function totalDelta(hasSource: boolean, hasDest: boolean, quantity: number): number {
  if (hasSource && hasDest) return 0;
  if (hasDest) return quantity;
  if (hasSource) return -quantity;
  return 0;
}

// Whether an event changes stock at ONE SPECIFIC location: it gains
// `quantity` if that location is the destination, loses `quantity` if it's
// the source. A move always has a different source and destination, so
// there's no double-counting.
export function locationDelta(
  locationId: number,
  eventSourceLocationId: number | null,
  eventDestinationLocationId: number | null,
  quantity: number
): number {
  let delta = 0;
  if (eventDestinationLocationId === locationId) delta += quantity;
  if (eventSourceLocationId === locationId) delta -= quantity;
  return delta;
}

// Which Total Stock column (Settings → Total Stock Columns) a location's
// stock falls into for the ledger: its "Shown under" column if it counts
// toward Total Stock, otherwise none. `location` is null for an event side
// with no location (stock entering or leaving the warehouse).
export function columnOf(
  location: { counted: boolean | null; columnId: number | null } | null
): number | null {
  if (!location?.counted) return null;
  return location.columnId;
}

// How much ONE column's balance changes from an event, given which column
// (if any) its source and destination each fall into. A move between two
// locations in the SAME column (e.g. Rack-to-Rack, both Good Stock) nets to
// zero — correct, since nothing entered or left that column as a whole.
export function bucketDelta<T>(
  bucket: T,
  sourceBucket: T | null,
  destBucket: T | null,
  quantity: number
): number {
  let delta = 0;
  if (destBucket === bucket) delta += quantity;
  if (sourceBucket === bucket) delta -= quantity;
  return delta;
}