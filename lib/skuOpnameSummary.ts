// Server-only: the Stock Opname Summary tab — every per-SKU (SOSKU-)
// opname of each product, split by Total Stock column (Good Stock, Defect,
// ... — Settings → Total Stock Columns) so the system quantity and the
// counted (SO) quantity can be compared column by column, opname after
// opname.
//
// System quantity per column: a SOSKU session only locks the SKU's TOTAL
// system quantity when the SKU is added. The split per column is rebuilt
// from the ledger: each location's stock at that moment = today's stock
// minus every stock movement logged since (the same backwards-from-live
// rule the ledgers use). Counted quantity per column: the counted lines,
// by the column of the location they were counted in.

import {
  items,
  locations,
  locationStock,
  locationStockEvents,
  stockOpname,
  stockOpnameItems,
  stockOpnameSkus,
  stockColumns,
  users,
} from "@/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, like, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { SKU_OPNAME_PREFIX } from "@/lib/skuOpname";

// A column of the summary: one Total Stock column of the warehouse, "other"
// (locations under no column, or not counted in Total Stock), or "total"
// (everything, using the locked system total).
export type SummaryBucket = { key: string; name: string };

export type BucketFigures = { system: number; counted: number };

export type SummaryLine = {
  locationCode: string;
  bucket: string; // bucket key, or "outside" for another warehouse
  systemQty: number; // at the moment the location was counted
  countedQty: number;
  countedAt: string | null; // display time, Asia/Jakarta
  countedBy: string | null;
};

export type SummaryEntry = {
  opnameNumber: string;
  itemId: number;
  date: string; // YYYY-MM-DD, Asia/Jakarta, when the SKU was added (locked)
  lockedAt: string; // YYYY-MM-DD HH:MM, Asia/Jakarta
  lockedAtMs: number;
  by: string | null;
  status: "IN_PROGRESS" | "DONE" | "CONFIRMED";
  buckets: Record<string, BucketFigures>; // includes "total"
  // Locked total minus what the ledger rebuild found across every location
  // (0 when every stock change since was logged).
  unaccounted: number;
  lines?: SummaryLine[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const cleanDate = (value: string | null | undefined): string | null =>
  value && DATE_RE.test(value) ? value : null;

const localDate = (column: any) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
const localDateTime = (column: any) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`;

// The warehouse's Total Stock columns, then Other, then Total.
export async function getSummaryBuckets(db: any, warehouseId: number): Promise<SummaryBucket[]> {
  const columns: { id: number; name: string }[] = await db
    .select({ id: stockColumns.id, name: stockColumns.name })
    .from(stockColumns)
    .where(eq(stockColumns.warehouseId, warehouseId))
    .orderBy(asc(stockColumns.sortOrder), asc(stockColumns.id));
  return [
    ...columns.map((c) => ({ key: `col:${c.id}`, name: c.name })),
    { key: "other", name: "Other" },
    { key: "total", name: "Total" },
  ];
}

// Every SOSKU opname of every SKU (or one SKU), oldest first, with its
// figures per bucket for one warehouse. from / to: YYYY-MM-DD (inclusive,
// Asia/Jakarta) on the day the SKU was locked.
export async function getSkuOpnameEntries(
  db: any,
  {
    warehouseId,
    from,
    to,
    itemId,
    withLines = false,
  }: { warehouseId: number; from?: string | null; to?: string | null; itemId?: number | null; withLines?: boolean }
): Promise<SummaryEntry[]> {
  const counter = alias(users, "counter");
  const lockedDate = localDate(stockOpnameSkus.addedAt);

  const conditions = [like(stockOpnameSkus.opnameNumber, `${SKU_OPNAME_PREFIX}%`)];
  if (from) conditions.push(gte(lockedDate, from));
  if (to) conditions.push(lte(lockedDate, to));
  if (itemId) conditions.push(eq(stockOpnameSkus.itemId, itemId));

  const skuRows: {
    opnameNumber: string;
    itemId: number;
    systemQty: number;
    addedAt: Date;
    date: string;
    lockedAt: string;
    completedAt: Date | null;
    confirmedAt: Date | null;
    by: string | null;
  }[] = await db
    .select({
      opnameNumber: stockOpnameSkus.opnameNumber,
      itemId: stockOpnameSkus.itemId,
      systemQty: stockOpnameSkus.systemQty,
      addedAt: stockOpnameSkus.addedAt,
      date: lockedDate,
      lockedAt: localDateTime(stockOpnameSkus.addedAt),
      completedAt: stockOpname.completedAt,
      confirmedAt: stockOpname.confirmedAt,
      by: users.username,
    })
    .from(stockOpnameSkus)
    .innerJoin(stockOpname, eq(stockOpname.opnameNumber, stockOpnameSkus.opnameNumber))
    .leftJoin(users, eq(users.id, sql`coalesce(${stockOpname.assignedTo}, ${stockOpname.createdBy})`))
    .where(and(...conditions))
    .orderBy(asc(stockOpnameSkus.addedAt), asc(stockOpnameSkus.id));

  if (skuRows.length === 0) return [];

  const itemIds = [...new Set(skuRows.map((r) => r.itemId))];
  const opnameNumbers = [...new Set(skuRows.map((r) => r.opnameNumber))];
  const earliest = skuRows[0].addedAt;

  const [locationRows, liveRows, eventRows, lineRows] = await Promise.all([
    db
      .select({
        id: locations.id,
        code: locations.code,
        warehouseId: locations.warehouseId,
        countsInTotalStock: locations.countsInTotalStock,
        stockColumnId: locations.stockColumnId,
      })
      .from(locations),
    db
      .select({ itemId: locationStock.itemId, locationId: locationStock.locationId, quantity: locationStock.quantity })
      .from(locationStock)
      .where(and(inArray(locationStock.itemId, itemIds), ne(locationStock.quantity, 0))),
    // Every stock movement since the earliest opname, newest first. RELEASE
    // moves nothing (lib/ledger.ts movesStock).
    db
      .select({
        itemId: locationStockEvents.itemId,
        sourceLocationId: locationStockEvents.sourceLocationId,
        destinationLocationId: locationStockEvents.destinationLocationId,
        quantity: locationStockEvents.quantity,
        createdAt: locationStockEvents.createdAt,
      })
      .from(locationStockEvents)
      .where(
        and(
          inArray(locationStockEvents.itemId, itemIds),
          gte(locationStockEvents.createdAt, earliest),
          ne(locationStockEvents.type, "RELEASE")
        )
      ),
    db
      .select({
        opnameNumber: stockOpnameItems.opnameNumber,
        itemId: stockOpnameItems.itemId,
        locationId: stockOpnameItems.locationId,
        systemQty: stockOpnameItems.systemQty,
        countedQty: stockOpnameItems.countedQty,
        countedAt: localDateTime(stockOpnameItems.countedAt),
        countedBy: counter.username,
      })
      .from(stockOpnameItems)
      .leftJoin(counter, eq(counter.id, stockOpnameItems.countedBy))
      .where(
        and(
          inArray(stockOpnameItems.opnameNumber, opnameNumbers),
          inArray(stockOpnameItems.itemId, itemIds),
          isNotNull(stockOpnameItems.itemId)
        )
      ),
  ]);

  // Which bucket each location's stock falls in, for this warehouse.
  const locationById = new Map<number, (typeof locationRows)[number]>(locationRows.map((l: any) => [l.id, l]));
  const bucketOf = (locationId: number): string => {
    const l = locationById.get(locationId);
    if (!l || l.warehouseId !== warehouseId) return "outside";
    return l.countsInTotalStock && l.stockColumnId ? `col:${l.stockColumnId}` : "other";
  };

  const liveByItem = new Map<number, Map<number, number>>();
  for (const r of liveRows as { itemId: number; locationId: number; quantity: number }[]) {
    if (!liveByItem.has(r.itemId)) liveByItem.set(r.itemId, new Map());
    liveByItem.get(r.itemId)!.set(r.locationId, r.quantity);
  }
  const eventsByItem = new Map<number, typeof eventRows>();
  for (const e of eventRows as any[]) {
    if (!eventsByItem.has(e.itemId)) eventsByItem.set(e.itemId, []);
    eventsByItem.get(e.itemId)!.push(e);
  }

  // Stock per location of an item at a moment: live minus everything after.
  const balancesAt = (id: number, at: Date): Map<number, number> => {
    const balances = new Map(liveByItem.get(id) ?? []);
    for (const e of eventsByItem.get(id) ?? []) {
      if (e.createdAt <= at) continue;
      if (e.destinationLocationId) {
        balances.set(e.destinationLocationId, (balances.get(e.destinationLocationId) ?? 0) - e.quantity);
      }
      if (e.sourceLocationId) {
        balances.set(e.sourceLocationId, (balances.get(e.sourceLocationId) ?? 0) + e.quantity);
      }
    }
    return balances;
  };

  const linesByKey = new Map<string, any[]>();
  for (const l of lineRows as any[]) {
    const key = `${l.opnameNumber}|${l.itemId}`;
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key)!.push(l);
  }

  return skuRows.map((row) => {
    const buckets: Record<string, BucketFigures> = {};
    const add = (key: string, field: keyof BucketFigures, qty: number) => {
      if (key === "outside") return;
      buckets[key] ??= { system: 0, counted: 0 };
      buckets[key][field] += qty;
    };

    let rebuiltTotal = 0;
    for (const [locationId, qty] of balancesAt(row.itemId, row.addedAt)) {
      rebuiltTotal += qty;
      add(bucketOf(locationId), "system", qty);
    }

    const lines = (linesByKey.get(`${row.opnameNumber}|${row.itemId}`) ?? []).map((l) => ({
      locationCode: locationById.get(l.locationId)?.code ?? `#${l.locationId}`,
      bucket: bucketOf(l.locationId),
      systemQty: l.systemQty,
      countedQty: l.countedQty ?? 0,
      countedAt: l.countedAt,
      countedBy: l.countedBy,
    }));
    let totalCounted = 0;
    for (const l of lines) {
      totalCounted += l.countedQty;
      add(l.bucket, "counted", l.countedQty);
    }
    buckets.total = { system: row.systemQty, counted: totalCounted };

    return {
      opnameNumber: row.opnameNumber,
      itemId: row.itemId,
      date: row.date,
      lockedAt: row.lockedAt,
      lockedAtMs: row.addedAt.getTime(),
      by: row.by,
      status: row.confirmedAt ? "CONFIRMED" : row.completedAt ? "DONE" : "IN_PROGRESS",
      buckets,
      unaccounted: row.systemQty - rebuiltTotal,
      ...(withLines
        ? { lines: lines.sort((a, b) => a.locationCode.localeCompare(b.locationCode, undefined, { numeric: true })) }
        : {}),
    };
  });
}

// Every product, for the summary rows (products never counted included).
export async function getSummaryItems(db: any): Promise<{ itemId: number; sku: string; name: string }[]> {
  return db
    .select({ itemId: items.id, sku: items.sku, name: items.name })
    .from(items)
    .orderBy(asc(items.sku));
}
