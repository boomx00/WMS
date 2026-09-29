// Shared by both Total Stock ledger endpoints (per-SKU and per-location) so
// they agree on the same start date and delta rules.
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

export function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatUtcDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

// Whether an event changes a SKU's TOTAL warehouse stock (summed across
// every location): dest-only = entering (+quantity), source-only = leaving
// (-quantity), both or neither set = no net change.
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
