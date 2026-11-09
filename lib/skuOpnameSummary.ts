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
//
// Lines use the SAME moment as the header: each line's systemQty is the
// location's stock at lock time (rebuilt from the ledger), so the lines'
// system and Δ add up to the column figures. The per-row snapshot stored
// when the location was counted is kept as systemAtCount — those snapshots
// are taken at different moments, so a move between two locations counted
// at different times drops out of (or doubles up in) their sum.
// movedSinceLock shows the net ledger movement at the location since lock.
//
// Loose packs (packs locations — "Counted in loose packs" types) count as
// a fraction of a carton: packs ÷ packs per carton, to 3 decimals. So a
// packs column's system / counted and every Total are decimals (30.5),
// the same basis as K3; the packs themselves are kept in systemPacks /
// countedPacks for the packs column to show. Lines at a packs location are
// in packs (unit "PACKS").

import {
  items,
  locations,
  locationTypes,
  locationStock,
  locationStockEvents,
  stockOpname,
  stockOpnameItems,
  stockOpnameSkus,
  stockColumns,
  users,
} from "@/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, like, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { SKU_OPNAME_PREFIX } from "@/lib/skuOpname";

// A column of the summary: one Total Stock column of the warehouse, "other"
// (locations under no column, or not counted in Total Stock), or "total"
// (everything, using the locked system total).
// packs: the column has a packs location — the page shows its packs as
// whole packs ("5 pk"; "12 + 5 pk" when cartons are in it too).
export type SummaryBucket = {
  key: string;
  name: string;
  nameId?: string | null;
  nameZh?: string | null;
  packs?: boolean;
};

// system / counted in cartons (decimal where packs are in); systemPacks /
// countedPacks: the loose packs in them; systemCartons / countedCartons: the
// whole cartons in them (set on columns only, when there are any).
export type BucketFigures = {
  system: number;
  counted: number;
  systemPacks?: number;
  countedPacks?: number;
  systemCartons?: number;
  countedCartons?: number;
};

export type SummaryLine = {
  locationCode: string;
  // "PACKS": a packs location — every quantity on the line is loose packs.
  unit: "CARTON" | "PACKS";
  bucket: string; // bucket key, or "outside" for another warehouse
  systemQty: number; // at the moment the SKU was locked (same basis as the header)
  systemAtCount: number; // snapshot stored when this location was counted
  liveQty: number; // the location's stock now
  movedSinceLock: number; // liveQty − systemQty: net ledger movement since lock
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
  // What was typed in the summary's "Adj" field for this SKU's opname, or
  // null when it's empty.
  adjustment: SummaryAdjustment | null;
  // Reconciliation typed in the report (+ / − on the Total SO), or null
  // while both are 0.
  reconciliation: SummaryReconciliation | null;
  lines?: SummaryLine[];
};

export type SummaryReconciliation = {
  plus: number; // added to the Total SO
  minus: number; // taken off the Total SO
  at: string | null; // YYYY-MM-DD HH:MM, Asia/Jakarta — when it was saved
  by: string | null; // who saved it
};

export type SummaryAdjustment = {
  note: string; // stock_opname_skus.adjustment_note (free text)
  at: string | null; // YYYY-MM-DD HH:MM, Asia/Jakarta — when it was saved
  by: string | null; // who saved it
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Loose packs as cartons (packs ÷ packs per carton); 0 without a carton size.
export const packsToCartons = (packs: number, packsPerCarton: number) =>
  packsPerCarton > 0 ? packs / packsPerCarton : 0;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const cleanDate = (value: string | null | undefined): string | null =>
  value && DATE_RE.test(value) ? value : null;

const localDate = (column: any) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
const localDateTime = (column: any) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`;

// The warehouse's Total Stock columns, then Other, then Total.
export async function getSummaryBuckets(db: any, warehouseId: number): Promise<SummaryBucket[]> {
  const [columns, columnUnits]: [
    { id: number; name: string; nameId: string | null; nameZh: string | null }[],
    { stockColumnId: number | null; packs: boolean; all: number }[],
  ] = await Promise.all([
    db
      .select({ id: stockColumns.id, name: stockColumns.name, nameId: stockColumns.nameId, nameZh: stockColumns.nameZh })
      .from(stockColumns)
      .where(eq(stockColumns.warehouseId, warehouseId))
      .orderBy(asc(stockColumns.sortOrder), asc(stockColumns.id)),
    // Per column: whether any location under it holds loose packs.
    db
      .select({
        stockColumnId: locations.stockColumnId,
        packs: sql<boolean>`bool_or(${locationTypes.countsInPacks})`,
        all: sql<number>`count(*)::int`,
      })
      .from(locations)
      .innerJoin(locationTypes, eq(locationTypes.code, locations.type))
      .where(and(eq(locations.warehouseId, warehouseId), eq(locations.countsInTotalStock, true)))
      .groupBy(locations.stockColumnId),
  ]);
  const packsColumns = new Set(
    columnUnits.filter((c) => c.stockColumnId !== null && c.packs).map((c) => c.stockColumnId as number)
  );
  return [
    // nameId / nameZh: the column's Indonesian / Chinese names (Settings →
    // Total Stock Columns), picked by the page for the chosen language.
    ...columns.map((c) => ({
      key: `col:${c.id}`,
      name: c.name,
      nameId: c.nameId,
      nameZh: c.nameZh,
      ...(packsColumns.has(c.id) ? { packs: true } : {}),
    })),
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
  const adjuster = alias(users, "adjuster");
  const reconciler = alias(users, "reconciler");
  const lockedDate = localDate(stockOpnameSkus.addedAt);

  const conditions = [like(stockOpnameSkus.opnameNumber, `${SKU_OPNAME_PREFIX}%`)];
  if (from) conditions.push(gte(lockedDate, from));
  if (to) conditions.push(lte(lockedDate, to));
  if (itemId) conditions.push(eq(stockOpnameSkus.itemId, itemId));

  const skuRows: {
    opnameNumber: string;
    itemId: number;
    systemQty: number;
    systemPacks: number;
    packsPerCarton: number;
    addedAt: Date;
    date: string;
    lockedAt: string;
    completedAt: Date | null;
    confirmedAt: Date | null;
    by: string | null;
    adjustmentNote: string | null;
    adjustedAt: string | null;
    adjustedBy: string | null;
    reconcilePlus: number;
    reconcileMinus: number;
    reconciledAt: string | null;
    reconciledBy: string | null;
  }[] = await db
    .select({
      opnameNumber: stockOpnameSkus.opnameNumber,
      itemId: stockOpnameSkus.itemId,
      systemQty: stockOpnameSkus.systemQty,
      systemPacks: stockOpnameSkus.systemPacks,
      packsPerCarton: items.cartonBagQty,
      addedAt: stockOpnameSkus.addedAt,
      date: lockedDate,
      lockedAt: localDateTime(stockOpnameSkus.addedAt),
      completedAt: stockOpname.completedAt,
      confirmedAt: stockOpname.confirmedAt,
      by: users.username,
      adjustmentNote: stockOpnameSkus.adjustmentNote,
      adjustedAt: localDateTime(stockOpnameSkus.adjustedAt),
      adjustedBy: adjuster.username,
      reconcilePlus: stockOpnameSkus.reconcilePlus,
      reconcileMinus: stockOpnameSkus.reconcileMinus,
      reconciledAt: localDateTime(stockOpnameSkus.reconciledAt),
      reconciledBy: reconciler.username,
    })
    .from(stockOpnameSkus)
    .innerJoin(stockOpname, eq(stockOpname.opnameNumber, stockOpnameSkus.opnameNumber))
    .innerJoin(items, eq(items.id, stockOpnameSkus.itemId))
    .leftJoin(users, eq(users.id, sql`coalesce(${stockOpname.assignedTo}, ${stockOpname.createdBy})`))
    .leftJoin(adjuster, eq(adjuster.id, stockOpnameSkus.adjustedBy))
    .leftJoin(reconciler, eq(reconciler.id, stockOpnameSkus.reconciledBy))
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
        countsInPacks: locationTypes.countsInPacks,
      })
      .from(locations)
      .innerJoin(locationTypes, eq(locationTypes.code, locations.type)),
    db
      .select({
        itemId: locationStock.itemId,
        locationId: locationStock.locationId,
        quantity: locationStock.quantity,
        loosePacks: locationStock.loosePacks,
      })
      .from(locationStock)
      .where(
        and(
          inArray(locationStock.itemId, itemIds),
          or(ne(locationStock.quantity, 0), ne(locationStock.loosePacks, 0))
        )
      ),
    // Every stock movement since the earliest opname, newest first. RELEASE
    // moves nothing (lib/ledger.ts movesStock).
    db
      .select({
        itemId: locationStockEvents.itemId,
        sourceLocationId: locationStockEvents.sourceLocationId,
        destinationLocationId: locationStockEvents.destinationLocationId,
        quantity: locationStockEvents.quantity,
        loosePacks: locationStockEvents.loosePacks,
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
        countsInPacks: stockOpnameItems.countsInPacks,
        systemPacks: stockOpnameItems.systemPacks,
        countedPacks: stockOpnameItems.countedPacks,
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

  // Cartons and loose packs, kept apart.
  const liveByItem = new Map<number, Map<number, number>>();
  const livePacksByItem = new Map<number, Map<number, number>>();
  for (const r of liveRows as { itemId: number; locationId: number; quantity: number; loosePacks: number }[]) {
    if (r.quantity !== 0) {
      if (!liveByItem.has(r.itemId)) liveByItem.set(r.itemId, new Map());
      liveByItem.get(r.itemId)!.set(r.locationId, r.quantity);
    }
    if (r.loosePacks !== 0) {
      if (!livePacksByItem.has(r.itemId)) livePacksByItem.set(r.itemId, new Map());
      livePacksByItem.get(r.itemId)!.set(r.locationId, r.loosePacks);
    }
  }
  const eventsByItem = new Map<number, typeof eventRows>();
  for (const e of eventRows as any[]) {
    if (!eventsByItem.has(e.itemId)) eventsByItem.set(e.itemId, []);
    eventsByItem.get(e.itemId)!.push(e);
  }

  // Stock per location of an item at a moment: live minus everything after.
  // packs = true: the same for loose packs (events' loose_packs).
  const balancesAt = (id: number, at: Date, packs = false): Map<number, number> => {
    const balances = new Map((packs ? livePacksByItem : liveByItem).get(id) ?? []);
    for (const e of eventsByItem.get(id) ?? []) {
      if (e.createdAt <= at) continue;
      const qty = packs ? e.loosePacks : e.quantity;
      if (!qty) continue;
      if (e.destinationLocationId) {
        balances.set(e.destinationLocationId, (balances.get(e.destinationLocationId) ?? 0) - qty);
      }
      if (e.sourceLocationId) {
        balances.set(e.sourceLocationId, (balances.get(e.sourceLocationId) ?? 0) + qty);
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
    const perCarton = row.packsPerCarton;
    const buckets: Record<string, BucketFigures> = {};
    const add = (key: string, field: "system" | "counted", qty: number, packs = 0) => {
      if (key === "outside") return;
      buckets[key] ??= { system: 0, counted: 0 };
      buckets[key][field] += qty + packsToCartons(packs, perCarton);
      if (qty !== 0) {
        const cartonsField = field === "system" ? "systemCartons" : "countedCartons";
        buckets[key][cartonsField] = (buckets[key][cartonsField] ?? 0) + qty;
      }
      if (packs !== 0) {
        const packsField = field === "system" ? "systemPacks" : "countedPacks";
        buckets[key][packsField] = (buckets[key][packsField] ?? 0) + packs;
      }
    };

    // One moment for the header AND the lines: the lock.
    const atLock = balancesAt(row.itemId, row.addedAt);
    const packsAtLock = balancesAt(row.itemId, row.addedAt, true);
    const live = liveByItem.get(row.itemId) ?? new Map<number, number>();
    const livePacks = livePacksByItem.get(row.itemId) ?? new Map<number, number>();

    let rebuiltTotal = 0;
    for (const [locationId, qty] of atLock) {
      rebuiltTotal += qty;
      add(bucketOf(locationId), "system", qty);
    }
    // Loose packs at the lock, from the ledger — what the Total uses, so a
    // SKU locked by code that didn't record packs (system_packs 0) still
    // gets them.
    let packsAtLockTotal = 0;
    for (const [locationId, packs] of packsAtLock) {
      packsAtLockTotal += packs;
      rebuiltTotal += packsToCartons(packs, perCarton);
      add(bucketOf(locationId), "system", 0, packs);
    }

    // A packs-location line is in loose packs, any other in cartons.
    const lines = (linesByKey.get(`${row.opnameNumber}|${row.itemId}`) ?? []).map((l) => {
      const inPacks: boolean = l.countsInPacks;
      const systemAtLock = (inPacks ? packsAtLock : atLock).get(l.locationId) ?? 0;
      const liveQty = (inPacks ? livePacks : live).get(l.locationId) ?? 0;
      return {
        locationCode: locationById.get(l.locationId)?.code ?? `#${l.locationId}`,
        unit: inPacks ? ("PACKS" as const) : ("CARTON" as const),
        bucket: bucketOf(l.locationId),
        systemQty: systemAtLock,
        systemAtCount: (inPacks ? l.systemPacks : l.systemQty) ?? 0,
        liveQty,
        movedSinceLock: liveQty - systemAtLock,
        countedQty: (inPacks ? l.countedPacks : l.countedQty) ?? 0,
        countedAt: l.countedAt,
        countedBy: l.countedBy,
      };
    });
    let totalCounted = 0;
    let totalCountedPacks = 0;
    for (const l of lines) {
      if (l.unit === "PACKS") {
        totalCountedPacks += l.countedQty;
        add(l.bucket, "counted", 0, l.countedQty);
      } else {
        totalCounted += l.countedQty;
        add(l.bucket, "counted", l.countedQty);
      }
    }
    for (const b of Object.values(buckets)) {
      b.system = round3(b.system);
      b.counted = round3(b.counted);
    }
    // Total: the locked cartons plus the locked loose packs as cartons.
    const lockedTotal = round3(row.systemQty + packsToCartons(packsAtLockTotal, perCarton));
    buckets.total = {
      system: lockedTotal,
      counted: round3(totalCounted + packsToCartons(totalCountedPacks, perCarton)),
      ...(packsAtLockTotal !== 0 ? { systemPacks: packsAtLockTotal } : {}),
      ...(totalCountedPacks !== 0 ? { countedPacks: totalCountedPacks } : {}),
    };

    return {
      opnameNumber: row.opnameNumber,
      itemId: row.itemId,
      date: row.date,
      lockedAt: row.lockedAt,
      lockedAtMs: row.addedAt.getTime(),
      by: row.by,
      status: row.confirmedAt ? "CONFIRMED" : row.completedAt ? "DONE" : "IN_PROGRESS",
      buckets,
      unaccounted: round3(lockedTotal - rebuiltTotal),
      adjustment: row.adjustmentNote
        ? { note: row.adjustmentNote, at: row.adjustedAt, by: row.adjustedBy }
        : null,
      reconciliation:
        row.reconcilePlus !== 0 || row.reconcileMinus !== 0
          ? { plus: row.reconcilePlus, minus: row.reconcileMinus, at: row.reconciledAt, by: row.reconciledBy }
          : null,
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