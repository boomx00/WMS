import { sql } from "drizzle-orm";
import { locationStockEvents } from "@/db/schema";

// "Final stock" for a location_stock_events row = the resulting
// location_stock quantity, for that specific SKU, immediately after this
// event — at whichever location is actually relevant to that event type:
//
//   - Every other type: the DESTINATION (the "To" location).
//   - SHIP: there is no destination (stock leaves the building) — the
//     relevant location instead is the SOURCE, i.e. Outbound WH, since
//     that's what the shipment actually drew down.
//
// Both branches use the same backward-anchored approach: start from the
// LIVE location_stock value for that (location, item) and subtract the
// net ledger change that happened strictly AFTER this event, rather than
// summing forward from event history. This guarantees the most recent
// event for a given (location, item) always matches location_stock
// exactly (nothing happened after it to subtract), and stays consistent
// for anything logged from now on — even though some routes have
// historically mutated location_stock without a matching event (e.g.
// Initial Stock, before it was fixed), which would otherwise make a
// forward-summed reconstruction permanently understate reality past such
// a gap.
//
// The ledger itself (destination credit / source debit across ALL
// location_stock_events for that location+item) is unchanged between the
// two branches — only which location column anchors it, and which
// column is used to pull the live starting value, differs.
export const finalStockAtDestinationSql = sql<number | null>`
  CASE
    WHEN ${locationStockEvents.type} = 'SHIP' AND ${locationStockEvents.sourceLocationId} IS NOT NULL THEN (
      COALESCE(
        (
          SELECT ls.quantity
          FROM location_stock ls
          WHERE ls.location_id = ${locationStockEvents.sourceLocationId}
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
            WHERE lse_dest.destination_location_id = ${locationStockEvents.sourceLocationId}
              AND lse_dest.item_id = ${locationStockEvents.itemId}
            UNION ALL
            SELECT -lse_src.quantity AS signed_qty, lse_src.created_at AS created_at, lse_src.id AS id
            FROM location_stock_events lse_src
            WHERE lse_src.source_location_id = ${locationStockEvents.sourceLocationId}
              AND lse_src.item_id = ${locationStockEvents.itemId}
          ) AS ledger
          WHERE ledger.created_at > ${locationStockEvents.createdAt}
             OR (ledger.created_at = ${locationStockEvents.createdAt} AND ledger.id > ${locationStockEvents.id})
        ),
        0
      )
    )::int
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