import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  items,
  locationStock,
  locationStockEvents,
  locations,
  users,
  salesOrders,
  tambahanOrders,
} from "@/db/schema";
import { eq, and, gte, sql, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  getLedgerStartAt,
  parseDateParam,
  formatLocalDateTime,
  totalDelta,
  classifyLocation,
  bucketDelta,
  BUCKETS,
  type Bucket,
} from "@/lib/ledger";

export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

type BucketEntry = {
  id: number;
  type: string;
  quantity: number;
  direction: "IN" | "OUT";
  otherLocationCode: string | null;
  soNumber: string | null;
  tambahanNumber: string | null;
  workOrderNumber: string | null;
  username: string;
  createdAt: string;
  delta: number;
  runningTotal: number;
};

// GET /api/total-stock/:sku/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns three parallel ledgers for the same item and date range — Good
// Stock (Floor + Rack), Export, and Defect — plus an always-present
// top-level `total` figure (opening/closing only, no entries) for a
// persistent footer. An event that moves stock BETWEEN two buckets (e.g.
// Floor -> Defect) shows up once in each bucket's ledger, as an OUT in one
// and an IN in the other — the same convention the per-location ledger
// already uses, just generalized from one location to a named group of
// them.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const fromParam = parseDateParam(req.nextUrl.searchParams.get("from"));
  const toParam = parseDateParam(req.nextUrl.searchParams.get("to"));
  const toExclusive = toParam ? new Date(toParam.getTime() + 24 * 60 * 60 * 1000) : null;

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const ledgerStartAt = await getLedgerStartAt();

  // Live totals per bucket, computed in one pass over location_stock —
  // same CASE-based grouping the Total Stock table itself uses, just done
  // in SQL here instead of client-side.
  const [liveRow] = await db
    .select({
      good: sql<number>`COALESCE(SUM(CASE WHEN ${locations.code} = 'FLOOR' OR ${locations.type} = 'RACK' THEN ${locationStock.quantity} ELSE 0 END), 0)::int`,
      exportQty: sql<number>`COALESCE(SUM(CASE WHEN ${locations.code} = 'EXPOR' THEN ${locationStock.quantity} ELSE 0 END), 0)::int`,
      defect: sql<number>`COALESCE(SUM(CASE WHEN ${locations.code} = 'DEFECT' THEN ${locationStock.quantity} ELSE 0 END), 0)::int`,
      total: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int`,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(eq(locationStock.itemId, item.id));

  const liveTotals: Record<Bucket, number> = {
    good: liveRow?.good ?? 0,
    export: liveRow?.exportQty ?? 0,
    defect: liveRow?.defect ?? 0,
  };
  const liveTotal = liveRow?.total ?? 0;

  const events = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      sourceCode: sourceLoc.code,
      sourceType: sourceLoc.type,
      destinationCode: destLoc.code,
      destinationType: destLoc.type,
      soNumber: salesOrders.soNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
      workOrderNumber: locationStockEvents.workOrderNumber,
      username: users.username,
      createdAtRaw: locationStockEvents.createdAt,
      createdAt: sql<string>`to_char(${locationStockEvents.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(locationStockEvents)
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(and(eq(locationStockEvents.itemId, item.id), gte(locationStockEvents.createdAt, ledgerStartAt)))
    .orderBy(asc(locationStockEvents.createdAt), asc(locationStockEvents.id));

  // Back out each bucket's (and the overall total's) balance at
  // ledgerStartAt from the live numbers above.
  const netsSinceStart: Record<Bucket, number> = { good: 0, export: 0, defect: 0 };
  let totalNetSinceStart = 0;
  for (const ev of events) {
    const srcBucket = classifyLocation(ev.sourceCode, ev.sourceType);
    const destBucket = classifyLocation(ev.destinationCode, ev.destinationType);
    for (const bucket of BUCKETS) {
      netsSinceStart[bucket] += bucketDelta(bucket, srcBucket, destBucket, ev.quantity);
    }
    totalNetSinceStart += totalDelta(ev.sourceCode != null, ev.destinationCode != null, ev.quantity);
  }

  const startBalances: Record<Bucket, number> = {
    good: liveTotals.good - netsSinceStart.good,
    export: liveTotals.export - netsSinceStart.export,
    defect: liveTotals.defect - netsSinceStart.defect,
  };
  const totalStartBalance = liveTotal - totalNetSinceStart;

  const truncated = Boolean(fromParam && fromParam < ledgerStartAt);
  const effectiveFrom = fromParam && fromParam > ledgerStartAt ? fromParam : ledgerStartAt;

  const running: Record<Bucket, number> = { ...startBalances };
  const opening: Record<Bucket, number> = { ...startBalances };
  const entries: Record<Bucket, BucketEntry[]> = { good: [], export: [], defect: [] };

  let totalRunning = totalStartBalance;
  let totalOpening = totalStartBalance;

  for (const ev of events) {
    const srcBucket = classifyLocation(ev.sourceCode, ev.sourceType);
    const destBucket = classifyLocation(ev.destinationCode, ev.destinationType);

    totalRunning += totalDelta(ev.sourceCode != null, ev.destinationCode != null, ev.quantity);
    if (ev.createdAtRaw < effectiveFrom) totalOpening = totalRunning;

    for (const bucket of BUCKETS) {
      const touches = srcBucket === bucket || destBucket === bucket;
      if (!touches) continue;

      const delta = bucketDelta(bucket, srcBucket, destBucket, ev.quantity);
      running[bucket] += delta;

      if (ev.createdAtRaw < effectiveFrom) {
        opening[bucket] = running[bucket];
      } else if (delta !== 0 && (!toExclusive || ev.createdAtRaw < toExclusive)) {
        entries[bucket].push({
          id: ev.id,
          type: ev.type,
          quantity: ev.quantity,
          direction: destBucket === bucket ? "IN" : "OUT",
          otherLocationCode: destBucket === bucket ? ev.sourceCode : ev.destinationCode,
          soNumber: ev.soNumber,
          tambahanNumber: ev.tambahanNumber,
          workOrderNumber: ev.workOrderNumber,
          username: ev.username,
          createdAt: ev.createdAt,
          delta,
          runningTotal: running[bucket],
        });
      }
    }
  }

  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    anchorOpeningAt: formatLocalDateTime(ledgerStartAt),
    truncated,
    rangeFrom: formatLocalDateTime(effectiveFrom),
    rangeTo: toParam ? formatLocalDateTime(toParam) : null,
    buckets: {
      good: { openingBalance: opening.good, closingBalance: running.good, entries: entries.good },
      export: { openingBalance: opening.export, closingBalance: running.export, entries: entries.export },
      defect: { openingBalance: opening.defect, closingBalance: running.defect, entries: entries.defect },
    },
    total: { openingBalance: totalOpening, closingBalance: totalRunning },
  });
}