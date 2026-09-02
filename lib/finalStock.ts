import { sql } from "drizzle-orm";
import { locationStockEvents } from "@/db/schema";

// "Final stock" for a location_stock_events row = what location_stock for
// (destinationLocationId, itemId) actually was immediately AFTER this
// event was applied. There's no stored running balance on the events
// table, so this reconstructs it: every event that ever affected this
// exact (location, item) pair is a signed ledger line — a +quantity credit
// when this location was the destination, a -quantity debit when it was
// the source (this correctly includes SHIP events debiting Outbound WH,
// even though SHIP rows themselves never get a displayed final-stock
// value) — summed up to and including this row's own timestamp.
//
// Only meaningful for rows that actually have a destination location.
// SHIP events have no destinationLocationId (they only ever appear in the
// ledger as a source-side debit), so this naturally evaluates to NULL for
// them without needing a special case — the explicit type check is just
// a second, more literal safeguard for "not for shipping" per spec.
//
// This is a correlated subquery evaluated per displayed row (bounded to
// the current page or search result set, at most ~200 rows) — not a
// full-table scan on every request, but each row does re-scan the full
// history for that one (location, item) pair, so this is a fine fit for
// warehouse-scale data but would need revisiting (e.g. a precomputed
// running-balance column) if event volume grows very large.
export const finalStockAtDestinationSql = sql<number | null>`
  CASE
    WHEN ${locationStockEvents.destinationLocationId} IS NOT NULL AND ${locationStockEvents.type} != 'SHIP' THEN (
      SELECT COALESCE(SUM(ledger.signed_qty), 0)::int
      FROM (
        SELECT lse_dest.quantity AS signed_qty, lse_dest.created_at AS created_at, lse_dest.id AS id
        FROM location_stock_events lse_dest
        WHERE lse_dest.destination_location_id = ${locationStockEvents.destinationLocationId}
          AND lse_dest.item_id = ${locationStockEvents.itemId}
        UNION ALL
        SELECT -lse_src.quantity AS signed_qty, lse_src.created_at AS created_at, lse_src.id AS id
        FROM location_stock_events lse_src
        WHERE lse_src.source_location_id = ${locationStockEvents.destinationLocationId}
          AND lse_src.item_id = ${locationStockEvents.itemId}
      ) AS ledger
      WHERE ledger.created_at < ${locationStockEvents.createdAt}
         OR (ledger.created_at = ${locationStockEvents.createdAt} AND ledger.id <= ${locationStockEvents.id})
    )
    ELSE NULL
  END
`;