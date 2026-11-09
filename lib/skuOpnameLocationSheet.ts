// Server-only: the Location Detail sheet of the Stock Opname report's Excel
// export. Every location of a warehouse, what the system had there and what
// the opname counted there, side by side.
//
// System stock of a SKU on the report: where it was when its SOSKU session
// locked it (the same moment as the report's System figures), from the
// session's column_snapshot — or rebuilt from the ledger for older sessions.
// System stock of any other SKU: at the end of the report's last date, rebuilt
// from the ledger (live stock minus every movement logged since), so an old
// report doesn't pick up today's stock.
//
// SO stock: the counted lines of the sessions the report asked for.
//
// A packs location ("Counted in loose packs" type) is shown in loose packs,
// system and SO alike, with " (pk)" after its code.

import {
  items,
  locations,
  locationStock,
  locationStockEvents,
  locationTypes,
  stockOpnameItems,
  stockOpnameSkus,
} from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, ne, or } from "drizzle-orm";

export type LocationSheetRow = {
  location: string;
  systemSku: string;
  systemQty: number | null;
  soSku: string;
  soQty: number | null;
};

// One SKU's SOSKU session whose counts go on the sheet.
export type LocationSheetLine = { opnameNumber: string; itemId: number };

const bySku = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// One location's rows. A SKU found in both goes on one row. What's left over
// shares a row on a single-SKU location (a rack: "the system says X, we found
// Y"), and gets its own row on a mixed location, where two different SKUs on
// one row would read as if they were being compared. Nothing at all = one
// blank row, so the location is still listed.
export function pairLocationRows(
  location: string,
  singleSku: boolean,
  system: Map<string, number>,
  counted: Map<string, number>
): LocationSheetRow[] {
  const row = (systemSku: string | null, soSku: string | null): LocationSheetRow => ({
    location,
    systemSku: systemSku ?? "",
    systemQty: systemSku === null ? null : system.get(systemSku)!,
    soSku: soSku ?? "",
    soQty: soSku === null ? null : counted.get(soSku)!,
  });

  const allSkus = [...new Set([...system.keys(), ...counted.keys()])].sort(bySku);
  if (allSkus.length === 0) return [row(null, null)];
  if (!singleSku) {
    return allSkus.map((sku) => row(system.has(sku) ? sku : null, counted.has(sku) ? sku : null));
  }

  const both = allSkus.filter((sku) => system.has(sku) && counted.has(sku));
  const systemOnly = allSkus.filter((sku) => system.has(sku) && !counted.has(sku));
  const countedOnly = allSkus.filter((sku) => !system.has(sku) && counted.has(sku));
  const rows = both.map((sku) => row(sku, sku));
  for (let i = 0; i < Math.max(systemOnly.length, countedOnly.length); i++) {
    rows.push(row(systemOnly[i] ?? null, countedOnly[i] ?? null));
  }
  return rows;
}

// Every location of the warehouse: single-SKU locations (racks) first, then
// the mixed ones (floor), each by type order and then location code.
// asOf: the moment for the system stock of SKUs not in `lines`.
export async function getLocationSheetRows(
  db: any,
  { warehouseId, asOf, lines }: { warehouseId: number; asOf: Date; lines: LocationSheetLine[] }
): Promise<LocationSheetRow[]> {
  const locationRows: {
    id: number;
    code: string;
    allowsMultipleSku: boolean;
    typeOrder: number;
    countsInPacks: boolean;
  }[] = await db
    .select({
      id: locations.id,
      code: locations.code,
      allowsMultipleSku: locationTypes.allowsMultipleSku,
      typeOrder: locationTypes.sortOrder,
      countsInPacks: locationTypes.countsInPacks,
    })
    .from(locations)
    .innerJoin(locationTypes, eq(locationTypes.code, locations.type))
    .where(eq(locations.warehouseId, warehouseId));
  if (locationRows.length === 0) return [];
  const locationIds = locationRows.map((l) => l.id);
  const inWarehouse = new Set(locationIds);
  const packsLocations = new Set(locationRows.filter((l) => l.countsInPacks).map((l) => l.id));

  // The report's sessions, per SKU.
  const wanted = new Set(lines.map((l) => `${l.opnameNumber}|${l.itemId}`));
  const opnameNumbers = [...new Set(lines.map((l) => l.opnameNumber))];
  const [lockRows, countRows]: [
    {
      opnameNumber: string;
      itemId: number;
      addedAt: Date;
      columnSnapshot: { locationId: number; qty: number; packs?: number }[] | null;
    }[],
    {
      opnameNumber: string;
      itemId: number;
      locationId: number;
      countedQty: number | null;
      countsInPacks: boolean;
      countedPacks: number | null;
    }[],
  ] =
    opnameNumbers.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              opnameNumber: stockOpnameSkus.opnameNumber,
              itemId: stockOpnameSkus.itemId,
              addedAt: stockOpnameSkus.addedAt,
              columnSnapshot: stockOpnameSkus.columnSnapshot,
            })
            .from(stockOpnameSkus)
            .where(inArray(stockOpnameSkus.opnameNumber, opnameNumbers)),
          db
            .select({
              opnameNumber: stockOpnameItems.opnameNumber,
              itemId: stockOpnameItems.itemId,
              locationId: stockOpnameItems.locationId,
              countedQty: stockOpnameItems.countedQty,
              countsInPacks: stockOpnameItems.countsInPacks,
              countedPacks: stockOpnameItems.countedPacks,
            })
            .from(stockOpnameItems)
            .where(
              and(
                inArray(stockOpnameItems.opnameNumber, opnameNumbers),
                inArray(stockOpnameItems.locationId, locationIds),
                isNotNull(stockOpnameItems.itemId)
              )
            ),
        ]);
  const locks = lockRows.filter((r) => wanted.has(`${r.opnameNumber}|${r.itemId}`));
  const lockByItem = new Map(locks.map((r) => [r.itemId, r]));

  // The ledger is needed back to asOf, and further back for a session with
  // no snapshot.
  const eventsSince = locks.reduce(
    (earliest, r) => (!r.columnSnapshot && r.addedAt < earliest ? r.addedAt : earliest),
    asOf
  );
  const [itemRows, liveRows, eventRows]: [
    { id: number; sku: string }[],
    { itemId: number; locationId: number; quantity: number; loosePacks: number }[],
    {
      itemId: number;
      sourceLocationId: number | null;
      destinationLocationId: number | null;
      quantity: number;
      loosePacks: number;
      createdAt: Date;
    }[],
  ] = await Promise.all([
    db.select({ id: items.id, sku: items.sku }).from(items),
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
          inArray(locationStock.locationId, locationIds),
          or(ne(locationStock.quantity, 0), ne(locationStock.loosePacks, 0))
        )
      ),
    // RELEASE moves nothing (lib/ledger.ts movesStock).
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
          gt(locationStockEvents.createdAt, eventsSince),
          ne(locationStockEvents.type, "RELEASE"),
          or(
            inArray(locationStockEvents.sourceLocationId, locationIds),
            inArray(locationStockEvents.destinationLocationId, locationIds)
          )
        )
      ),
  ]);
  const skuOf = new Map(itemRows.map((i) => [i.id, i.sku]));

  const liveByItem = new Map<number, Map<number, number>>();
  // In the location's unit: loose packs at a packs location.
  for (const r of liveRows) {
    if (!liveByItem.has(r.itemId)) liveByItem.set(r.itemId, new Map());
    liveByItem.get(r.itemId)!.set(r.locationId, packsLocations.has(r.locationId) ? r.loosePacks : r.quantity);
  }
  const moved = (e: (typeof eventRows)[number], locationId: number) =>
    packsLocations.has(locationId) ? e.loosePacks : e.quantity;
  const eventsByItem = new Map<number, typeof eventRows>();
  for (const e of eventRows) {
    if (!eventsByItem.has(e.itemId)) eventsByItem.set(e.itemId, []);
    eventsByItem.get(e.itemId)!.push(e);
  }
  // Stock per location of an item at a moment: live minus everything after.
  const balancesAt = (itemId: number, at: Date): Map<number, number> => {
    const balances = new Map(liveByItem.get(itemId) ?? []);
    for (const e of eventsByItem.get(itemId) ?? []) {
      if (e.createdAt <= at) continue;
      if (e.destinationLocationId) {
        balances.set(
          e.destinationLocationId,
          (balances.get(e.destinationLocationId) ?? 0) - moved(e, e.destinationLocationId)
        );
      }
      if (e.sourceLocationId) {
        balances.set(e.sourceLocationId, (balances.get(e.sourceLocationId) ?? 0) + moved(e, e.sourceLocationId));
      }
    }
    return balances;
  };

  // location -> SKU -> quantity
  const systemAt = new Map<number, Map<string, number>>();
  const addSystem = (itemId: number, locationId: number, qty: number) => {
    const sku = skuOf.get(itemId);
    if (!sku || qty === 0 || !inWarehouse.has(locationId)) return;
    if (!systemAt.has(locationId)) systemAt.set(locationId, new Map());
    systemAt.get(locationId)!.set(sku, qty);
  };
  const allItemIds = new Set<number>([...liveByItem.keys(), ...eventsByItem.keys(), ...lockByItem.keys()]);
  for (const itemId of allItemIds) {
    const lock = lockByItem.get(itemId);
    if (lock?.columnSnapshot) {
      for (const s of lock.columnSnapshot) {
        addSystem(itemId, s.locationId, packsLocations.has(s.locationId) ? s.packs ?? 0 : s.qty);
      }
    } else {
      for (const [locationId, qty] of balancesAt(itemId, lock?.addedAt ?? asOf)) addSystem(itemId, locationId, qty);
    }
  }

  const countedAt = new Map<number, Map<string, number>>();
  for (const c of countRows) {
    if (!wanted.has(`${c.opnameNumber}|${c.itemId}`)) continue;
    const sku = skuOf.get(c.itemId);
    if (!sku) continue;
    const qty = (c.countsInPacks ? c.countedPacks : c.countedQty) ?? 0;
    // A 0 where the system has none of it is a corrected scan, not a finding.
    if (qty === 0 && !systemAt.get(c.locationId)?.has(sku)) continue;
    if (!countedAt.has(c.locationId)) countedAt.set(c.locationId, new Map());
    const atLocation = countedAt.get(c.locationId)!;
    atLocation.set(sku, (atLocation.get(sku) ?? 0) + qty);
  }

  return [...locationRows]
    .sort(
      (a, b) =>
        Number(a.allowsMultipleSku) - Number(b.allowsMultipleSku) ||
        a.typeOrder - b.typeOrder ||
        a.code.localeCompare(b.code, undefined, { numeric: true })
    )
    .flatMap((l) =>
      pairLocationRows(
        l.countsInPacks ? `${l.code} (pk)` : l.code,
        !l.allowsMultipleSku,
        systemAt.get(l.id) ?? new Map(),
        countedAt.get(l.id) ?? new Map()
      )
    );
}
