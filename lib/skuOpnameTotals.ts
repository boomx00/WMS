// Server-only: the SKUs of per-SKU (SOSKU-) sessions with their totals —
// used by the session detail (PDA SKU card, web expanded session) and the
// session lists (PDA "Stock Opname - By SKU", web Stock Opname tab), so they
// all show the same numbers.
//
// Totals are on the Total Stock basis, like the Stock Opname Summary: a
// location not counted in Total Stock (Locations page) is still listed
// (inTotalStock false) but left out of systemQty / countedQty and their
// packs. Which locations counted is taken from when the SKU was locked
// (column_snapshot) and when each line was first counted; for locks from
// before that was recorded, systemQty stays the full locked quantity.
// lockedQty / lockedPacks: the full lock, every location.
//
// systemPacks is rebuilt from the ledger (loose packs now, minus every pack
// movement since the lock), the same way the Stock Opname Summary does —
// so it's right even for a SKU locked by code that didn't record packs.

import {
  stockOpnameItems,
  stockOpnameSkus,
  locations,
  locationStock,
  locationStockEvents,
  items,
  users,
} from "@/db/schema";
import { and, asc, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { eq } from "drizzle-orm";

export type SkuOpnameLine = {
  locationCode: string;
  unit: "CARTON" | "PACKS"; // PACKS: a packs location — the line is in loose packs
  inTotalStock: boolean;
  systemQty: number;
  countedQty: number;
  difference: number;
  countedAt: Date | null;
  countedByUsername: string | null;
};

export type SkuOpnameSku = {
  itemId: number;
  skuCode: string;
  skuName: string;
  systemQty: number;
  countedQty: number;
  difference: number;
  systemPacks: number;
  countedPacks: number;
  differencePacks: number;
  lockedQty: number;
  lockedPacks: number;
  packsPerCarton: number;
  lines: SkuOpnameLine[];
};

// Cartons plus loose packs as cartons (packs ÷ packs per carton).
export const withPacks = (cartons: number, packs: number, packsPerCarton: number) =>
  packsPerCarton > 0 ? cartons + packs / packsPerCarton : cartons;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Every SKU of the given sessions, oldest added first, by session.
export async function getSkuOpnameSkus(db: any, opnameNumbers: string[]): Promise<Map<string, SkuOpnameSku[]>> {
  const out = new Map<string, SkuOpnameSku[]>();
  if (opnameNumbers.length === 0) return out;

  const skuRows: {
    opnameNumber: string;
    itemId: number;
    systemQty: number;
    columnSnapshot: { locationId: number; qty: number; packs?: number; countsInTotalStock: boolean }[] | null;
    addedAt: Date;
    packsPerCarton: number;
    skuCode: string;
    skuName: string;
  }[] = await db
    .select({
      opnameNumber: stockOpnameSkus.opnameNumber,
      itemId: stockOpnameSkus.itemId,
      systemQty: stockOpnameSkus.systemQty,
      columnSnapshot: stockOpnameSkus.columnSnapshot,
      addedAt: stockOpnameSkus.addedAt,
      packsPerCarton: items.cartonBagQty,
      skuCode: items.sku,
      skuName: items.name,
    })
    .from(stockOpnameSkus)
    .innerJoin(items, eq(stockOpnameSkus.itemId, items.id))
    .where(inArray(stockOpnameSkus.opnameNumber, opnameNumbers))
    .orderBy(asc(stockOpnameSkus.addedAt), asc(stockOpnameSkus.id));
  if (skuRows.length === 0) return out;

  const lineRows: {
    opnameNumber: string;
    itemId: number | null;
    locationCode: string;
    systemQty: number;
    countedQty: number | null;
    difference: number | null;
    countsInPacks: boolean;
    systemPacks: number;
    countedPacks: number | null;
    differencePacks: number;
    snapshotCountsInTotal: boolean | null;
    locationCountsInTotal: boolean;
    countedAt: Date | null;
    countedByUsername: string | null;
  }[] = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      itemId: stockOpnameItems.itemId,
      locationCode: locations.code,
      systemQty: stockOpnameItems.systemQty,
      countedQty: stockOpnameItems.countedQty,
      difference: stockOpnameItems.difference,
      countsInPacks: stockOpnameItems.countsInPacks,
      systemPacks: stockOpnameItems.systemPacks,
      countedPacks: stockOpnameItems.countedPacks,
      differencePacks: stockOpnameItems.differencePacks,
      snapshotCountsInTotal: stockOpnameItems.snapshotCountsInTotal,
      locationCountsInTotal: locations.countsInTotalStock,
      countedAt: stockOpnameItems.countedAt,
      countedByUsername: users.username,
    })
    .from(stockOpnameItems)
    .innerJoin(locations, eq(stockOpnameItems.locationId, locations.id))
    .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNotNull(stockOpnameItems.itemId)))
    .orderBy(asc(locations.area), asc(locations.x), asc(locations.y), asc(locations.code));

  // Loose packs per (item, location) at each SKU's lock: live minus every
  // pack movement logged since.
  const itemIds = [...new Set(skuRows.map((r) => r.itemId))];
  const earliest = skuRows.reduce((min, r) => (r.addedAt < min ? r.addedAt : min), skuRows[0].addedAt);
  const [livePacks, packEvents, locationFlags]: [
    { itemId: number; locationId: number; packs: number }[],
    { itemId: number; sourceLocationId: number | null; destinationLocationId: number | null; packs: number; createdAt: Date }[],
    { id: number; countsInTotalStock: boolean }[],
  ] = await Promise.all([
    db
      .select({ itemId: locationStock.itemId, locationId: locationStock.locationId, packs: locationStock.loosePacks })
      .from(locationStock)
      .where(and(inArray(locationStock.itemId, itemIds), ne(locationStock.loosePacks, 0))),
    db
      .select({
        itemId: locationStockEvents.itemId,
        sourceLocationId: locationStockEvents.sourceLocationId,
        destinationLocationId: locationStockEvents.destinationLocationId,
        packs: locationStockEvents.loosePacks,
        createdAt: locationStockEvents.createdAt,
      })
      .from(locationStockEvents)
      .where(
        and(
          inArray(locationStockEvents.itemId, itemIds),
          ne(locationStockEvents.loosePacks, 0),
          gt(locationStockEvents.createdAt, earliest)
        )
      ),
    db.select({ id: locations.id, countsInTotalStock: locations.countsInTotalStock }).from(locations),
  ]);
  const countsInTotalNow = new Map(locationFlags.map((l) => [l.id, l.countsInTotalStock]));
  const packsAtLock = (itemId: number, at: Date, inTotal: (locationId: number) => boolean): number => {
    const balances = new Map<number, number>();
    for (const r of livePacks) if (r.itemId === itemId) balances.set(r.locationId, r.packs);
    for (const e of packEvents) {
      if (e.itemId !== itemId || e.createdAt <= at) continue;
      if (e.destinationLocationId) {
        balances.set(e.destinationLocationId, (balances.get(e.destinationLocationId) ?? 0) - e.packs);
      }
      if (e.sourceLocationId) {
        balances.set(e.sourceLocationId, (balances.get(e.sourceLocationId) ?? 0) + e.packs);
      }
    }
    let total = 0;
    for (const [locationId, packs] of balances) if (inTotal(locationId)) total += packs;
    return total;
  };

  const linesByKey = new Map<string, typeof lineRows>();
  for (const row of lineRows) {
    if (row.itemId === null) continue;
    const key = `${row.opnameNumber}|${row.itemId}`;
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key)!.push(row);
  }

  for (const s of skuRows) {
    // A line's figures are in its own unit: loose packs at a packs location
    // (unit "PACKS"), cartons everywhere else.
    const lines: SkuOpnameLine[] = (linesByKey.get(`${s.opnameNumber}|${s.itemId}`) ?? []).map((l) => {
      const inPacks = l.countsInPacks;
      const systemQty = inPacks ? l.systemPacks : l.systemQty;
      const countedQty = (inPacks ? l.countedPacks : l.countedQty) ?? 0;
      return {
        locationCode: l.locationCode,
        unit: inPacks ? "PACKS" : "CARTON",
        // Counted in Total Stock (as when first counted here).
        inTotalStock: l.snapshotCountsInTotal ?? l.locationCountsInTotal,
        systemQty,
        countedQty,
        difference: inPacks ? l.differencePacks : l.difference ?? countedQty - systemQty,
        countedAt: l.countedAt,
        countedByUsername: l.countedByUsername,
      };
    });
    // Cartons and loose packs are totalled separately, Total Stock
    // locations only.
    const inTotalLines = lines.filter((l) => l.inTotalStock);
    const countedQty = inTotalLines.filter((l) => l.unit !== "PACKS").reduce((sum, l) => sum + l.countedQty, 0);
    const countedPacks = inTotalLines.filter((l) => l.unit === "PACKS").reduce((sum, l) => sum + l.countedQty, 0);
    // The lock, Total Stock locations only (the full lock when there's no
    // snapshot to tell).
    const snapshot = s.columnSnapshot;
    const systemQty = snapshot
      ? snapshot.filter((r) => r.countsInTotalStock).reduce((sum, r) => sum + r.qty, 0)
      : s.systemQty;
    // Total Stock as at the lock where the snapshot says, as now otherwise.
    const snapshotInTotal = new Map((snapshot ?? []).map((r) => [r.locationId, r.countsInTotalStock]));
    const lockedInTotal = (locationId: number) =>
      snapshotInTotal.get(locationId) ?? countsInTotalNow.get(locationId) ?? true;
    const systemPacks = packsAtLock(s.itemId, s.addedAt, lockedInTotal);

    if (!out.has(s.opnameNumber)) out.set(s.opnameNumber, []);
    out.get(s.opnameNumber)!.push({
      itemId: s.itemId,
      skuCode: s.skuCode,
      skuName: s.skuName,
      systemQty,
      countedQty,
      difference: countedQty - systemQty,
      systemPacks,
      countedPacks,
      differencePacks: countedPacks - systemPacks,
      lockedQty: s.systemQty,
      lockedPacks: packsAtLock(s.itemId, s.addedAt, () => true),
      packsPerCarton: s.packsPerCarton,
      lines,
    });
  }
  return out;
}

// A session's totals over its SKUs: cartons (systemQty / countedQty) and
// cartons with loose packs as a decimal (systemTotal / countedTotal).
export function sessionTotals(skus: SkuOpnameSku[]) {
  let systemQty = 0;
  let countedQty = 0;
  let systemTotal = 0;
  let countedTotal = 0;
  for (const s of skus) {
    systemQty += s.systemQty;
    countedQty += s.countedQty;
    systemTotal += withPacks(s.systemQty, s.systemPacks, s.packsPerCarton);
    countedTotal += withPacks(s.countedQty, s.countedPacks, s.packsPerCarton);
  }
  return { systemQty, countedQty, systemTotal: round3(systemTotal), countedTotal: round3(countedTotal) };
}
