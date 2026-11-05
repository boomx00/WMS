// Server-only: Settings → Operations Freeze. While it's on, nothing that changes
// stock goes through, on the web or the PDA, for any role. It's enforced once,
// in proxy.ts, for the API routes below. Reading stock and counting it (stock
// opname sessions and their counts) still work, so a count can run during it.
//
// ADDING A ROUTE THAT CHANGES STOCK? Add it here if it isn't already covered.

import { db } from "@/lib/db";
import { settings } from "@/db/schema";

const STOCK_ROUTES: RegExp[] = [
  // Inbound, move, pick, ship and their corrections, old (pallets) and new.
  /^\/api\/location-stock(\/|$)/,
  /^\/api\/pallets(\/|$)/,
  // Adjustments and manual stock corrections.
  /^\/api\/bulk-adjustments(\/|$)/,
  /^\/api\/other-transactions(\/|$)/,
  /^\/api\/stock-opname\/[^/]+\/adjust$/,
  // Sales order actions that write to the stock ledger.
  /^\/api\/sales-orders\/[^/]+\/(claim|correct-shipment|finish|unfinish|delete)$/,
  /^\/api\/sales-orders\/[^/]+\/tambahan\/confirm$/,
];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const OPERATIONS_FROZEN_MESSAGE =
  "Operations are frozen. Stock can't be moved, received, shipped or adjusted until the freeze is turned off in Settings.";

export function isStockOperation(method: string, pathname: string): boolean {
  if (READ_METHODS.has(method)) return false;
  return STOCK_ROUTES.some((route) => route.test(pathname));
}

export async function isOperationsFrozen(): Promise<boolean> {
  const [row] = await db.select({ frozen: settings.operationsFrozen }).from(settings).limit(1);
  return row?.frozen ?? false;
}
