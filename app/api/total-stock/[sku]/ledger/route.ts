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
import { isUnpick, UNPICK_TYPE } from "@/lib/unpick";
import {
  getLedgerStartAt,
  parseDateParam,
  formatLocalDateTime,
  totalDelta,
  columnOf,
  bucketDelta,
  movesStock,
} from "@/lib/ledger";
import { getStockColumns } from "@/lib/stockColumns";
import { parseWarehouseId } from "@/lib/warehouses";

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

// GET /api/total-stock/:sku/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD[&warehouseId=N]
//
// With warehouseId: that warehouse's Total Stock tab — its columns, and only
// its locations count (stock moved to another warehouse leaves this one's
// total). Without it: every warehouse together.
//
// Returns one ledger per Total Stock column (Settings → Total Stock
// Columns, in display order) for the same item and date range, plus an
// always-present top-level `total` figure (opening/closing only, no
// entries) for a persistent footer. Only locations that count toward
// Total Stock are included. An event that moves stock BETWEEN two columns
// (e.g. Floor -> Defect) shows up once in each column's ledger, as an OUT
// in one and an IN in the other — the same convention the per-location
// ledger already uses, just generalized from one location to a named
// group of them.
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

  const warehouseId = parseWarehouseId(req.nextUrl.searchParams.get("warehouseId"));
  const [ledgerStartAt, columns] = await Promise.all([getLedgerStartAt(), getStockColumns(db, warehouseId)]);
  const columnIds = columns.map((c) => c.id);
  // Whether a location is inside the Total Stock being shown.
  const counts = (countsInTotalStock: boolean | null, locationWarehouseId: number | null) =>
    !!countsInTotalStock && (warehouseId === null || locationWarehouseId === warehouseId);

  // Live totals per column (and overall), over the locations that count
  // toward Total Stock — same grouping the Total Stock table itself uses.
  const liveRows = await db
    .select({
      columnId: locations.stockColumnId,
      quantity: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int`,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(
      and(
        eq(locationStock.itemId, item.id),
        eq(locations.countsInTotalStock, true),
        warehouseId === null ? undefined : eq(locations.warehouseId, warehouseId)
      )
    )
    .groupBy(locations.stockColumnId);

  const liveTotals = new Map<number, number>(columnIds.map((id) => [id, 0]));
  let liveTotal = 0;
  for (const row of liveRows) {
    liveTotal += row.quantity;
    if (row.columnId !== null && liveTotals.has(row.columnId)) liveTotals.set(row.columnId, row.quantity);
  }

  const events = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      sourceCode: sourceLoc.code,
      sourceCounted: sourceLoc.countsInTotalStock,
      sourceColumnId: sourceLoc.stockColumnId,
      sourceWarehouseId: sourceLoc.warehouseId,
      destinationCode: destLoc.code,
      destinationCounted: destLoc.countsInTotalStock,
      destinationColumnId: destLoc.stockColumnId,
      destinationWarehouseId: destLoc.warehouseId,
      soNumber: sql<string | null>`coalesce(${salesOrders.soNumber}, ${locationStockEvents.deletedSoNumber})`,
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

  // Where each side of an event sits: which column, and whether it's
  // inside Total Stock at all.
  const sides = (ev: (typeof events)[number]) => {
    const source =
      ev.sourceCode != null
        ? { counted: counts(ev.sourceCounted, ev.sourceWarehouseId), columnId: ev.sourceColumnId }
        : null;
    const dest =
      ev.destinationCode != null
        ? { counted: counts(ev.destinationCounted, ev.destinationWarehouseId), columnId: ev.destinationColumnId }
        : null;
    return {
      srcColumn: columnOf(source),
      destColumn: columnOf(dest),
      srcInTotal: !!source?.counted,
      destInTotal: !!dest?.counted,
    };
  };

  // Back out each column's (and the overall total's) balance at
  // ledgerStartAt from the live numbers above.
  const netsSinceStart = new Map<number, number>(columnIds.map((id) => [id, 0]));
  let totalNetSinceStart = 0;
  for (const ev of events) {
    if (!movesStock(ev.type)) continue;
    const { srcColumn, destColumn, srcInTotal, destInTotal } = sides(ev);
    for (const id of columnIds) {
      netsSinceStart.set(id, netsSinceStart.get(id)! + bucketDelta(id, srcColumn, destColumn, ev.quantity));
    }
    totalNetSinceStart += totalDelta(srcInTotal, destInTotal, ev.quantity);
  }

  const startBalances = new Map<number, number>(
    columnIds.map((id) => [id, liveTotals.get(id)! - netsSinceStart.get(id)!])
  );
  const totalStartBalance = liveTotal - totalNetSinceStart;

  const truncated = Boolean(fromParam && fromParam < ledgerStartAt);
  const effectiveFrom = fromParam && fromParam > ledgerStartAt ? fromParam : ledgerStartAt;

  const running = new Map(startBalances);
  const opening = new Map(startBalances);
  const entries = new Map<number, BucketEntry[]>(columnIds.map((id) => [id, []]));

  let totalRunning = totalStartBalance;
  let totalOpening = totalStartBalance;

  for (const ev of events) {
    const { srcColumn, destColumn, srcInTotal, destInTotal } = sides(ev);
    // RELEASE is listed (Δ 0) but doesn't change any balance.
    const moves = movesStock(ev.type);

    if (moves) totalRunning += totalDelta(srcInTotal, destInTotal, ev.quantity);
    if (ev.createdAtRaw < effectiveFrom) totalOpening = totalRunning;

    for (const id of columnIds) {
      const touches = srcColumn === id || destColumn === id;
      if (!touches) continue;

      const delta = moves ? bucketDelta(id, srcColumn, destColumn, ev.quantity) : 0;
      running.set(id, running.get(id)! + delta);

      if (ev.createdAtRaw < effectiveFrom) {
        opening.set(id, running.get(id)!);
      } else if ((delta !== 0 || !moves) && (!toExclusive || ev.createdAtRaw < toExclusive)) {
        // Un-picks are stored reversed (lib/unpick.ts): show them as the
        // move that physically happened, so IN / OUT matches the delta.
        const unpick = isUnpick(ev.type, ev.quantity);
        entries.get(id)!.push({
          id: ev.id,
          type: unpick ? UNPICK_TYPE : ev.type,
          quantity: unpick ? -ev.quantity : ev.quantity,
          direction: (destColumn === id) !== unpick ? "IN" : "OUT",
          otherLocationCode: destColumn === id ? ev.sourceCode : ev.destinationCode,
          soNumber: ev.soNumber,
          tambahanNumber: ev.tambahanNumber,
          workOrderNumber: ev.workOrderNumber,
          username: ev.username,
          createdAt: ev.createdAt,
          delta,
          runningTotal: running.get(id)!,
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
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      nameId: c.nameId,
      nameZh: c.nameZh,
      openingBalance: opening.get(c.id)!,
      closingBalance: running.get(c.id)!,
      entries: entries.get(c.id)!,
    })),
    total: { openingBalance: totalOpening, closingBalance: totalRunning },
  });
}
