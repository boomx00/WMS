import { sql } from "drizzle-orm";
import { locationStockEvents } from "@/db/schema";

// "Final stock" for a location_stock_events row = what location_stock for
// (destinationLocationId, itemId) was immediately AFTER this event.
//
// This is anchored to the LIVE location_stock value and works backward,
// rather than summing forward from event history:
//
//   final_stock(event) = live_quantity - (net ledger change AFTER event)
//
// Why: some routes have historically mutated location_stock without
// logging a matching location_stock_events row (e.g. Initial Stock,
// before it was fixed), which would make a forward-summed reconstruction
// permanently understate reality for anything after such a gap. Anchoring
// to the live value instead guarantees the most recent event for a given
// (location, item) always matches location_stock exactly — by
// definition, nothing happened after it to subtract — and every event
// logged from this point forward stays consistent, since gaps can now
// only exist in the historical portion being subtracted for older rows,
// not in the anchor itself.
//
// The ledger (destination credit / source debit) is otherwise the same
// as before, just applied in the opposite direction: sum of everything
// that happened strictly AFTER this event, subtracted from the live
// total.
export const finalStockAtDestinationSql = sql<number | null>`
  CASE
    WHEN ${locationStockEvents.destinationLocationId} IS NOT NULL AND ${locationStockEvents.type} != 'SHIP' THEN (
      COALESCE(
        (
          SELECT ls.quantity
          FROM location_stock ls
          WHERE ls.location_id = ${locationStockEvents.destinationLocationId}
            AND ls.item_id = ${locationStockEvents.itemId}
        ),
        0
      )
      -
      COALESCE(
        (
          SELECT SUM(ledger.signed_qty)
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
          WHERE ledger.created_at > ${locationStockEvents.createdAt}
             OR (ledger.created_at = ${locationStockEvents.createdAt} AND ledger.id > ${locationStockEvents.id})
        ),
        0
      )
    )::int
    ELSE NULL
  END
`;