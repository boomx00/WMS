import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users, salesOrders } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { finalStockAtDestinationSql } from "@/lib/finalStock";
import MovementHistoryV2Table from "./MovementHistoryV2Table";
import { tambahanOrders } from "@/db/schema";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

async function getTotalCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(locationStockEvents);
  return row.count;
}

async function getEventsForPage(page: number) {
  const offset = (page - 1) * PAGE_SIZE;

  // finalStockAtDestinationSql is a pair of correlated subqueries per row,
  // so it must only ever run against the PAGE_SIZE rows we're actually
  // returning — not against every row Postgres has to walk past to
  // satisfy OFFSET. With a plain LIMIT/OFFSET on the full select list,
  // Postgres evaluates that expensive subquery offset+PAGE_SIZE times
  // (e.g. ~5000 times for page 100) before discarding everything but the
  // last 50, which is what was timing out.
  //
  // Fix: pick this page's ids first from a lean id-only subquery (fast —
  // backed by location_stock_events_created_at_id_idx), then join
  // everything else, including finalStock, onto just those PAGE_SIZE ids.
  const pageIds = db
    .select({ id: locationStockEvents.id })
    .from(locationStockEvents)
    .orderBy(desc(locationStockEvents.createdAt), desc(locationStockEvents.id))
    .limit(PAGE_SIZE)
    .offset(offset)
    .as("page_ids");

  return db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      itemSku: items.sku,
      itemName: items.name,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: salesOrders.soNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
      quantity: locationStockEvents.quantity,
      username: users.username,
      createdAt: locationStockEvents.createdAt,
      // Resulting location_stock balance at the "To" location immediately
      // after this event — null for events with no destination (SHIP).
      finalStock: finalStockAtDestinationSql,
    })
    .from(locationStockEvents)
    .innerJoin(pageIds, eq(locationStockEvents.id, pageIds.id))
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    // Same tiebreak as pageIds — several events can share the exact same
    // createdAt (e.g. a tagged/untagged pick pair inserted in one
    // transaction), so ordering by createdAt alone isn't deterministic.
    .orderBy(desc(locationStockEvents.createdAt), desc(locationStockEvents.id));
}

export default async function MovementHistoryV2Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [totalCount, rows] = await Promise.all([getTotalCount(), getEventsForPage(page)]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Movement History (v2)</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Location-based picking and shipping activity — separate from the
          pallet-level history on the main History page.
        </p>
      </header>

      <MovementHistoryV2Table rows={rows} page={page} totalPages={totalPages} totalCount={totalCount} />
    </div>
  );
}