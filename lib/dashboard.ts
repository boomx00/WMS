// Server-only: the Dashboard's data for one office day (see lib/officeDay.ts).
//
// Product Movement — one row per SKU, read straight off the
// location_stock_events ledger:
//   In:  Production  INBOUND / DEFAULT_INBOUND (PDA pallet inbound, by MO)
//        Other       OTHER_INBOUND  (Other Transactions → Inbound)
//   Out: Sales Orders SHIP against a sales order or Tambahan batch
//        Other        OTHER_OUTBOUND (Other Transactions → Outbound)
// Quantities are summed as stored, so shipment corrections (negative SHIP
// rows) net out. SHIP rows of a deleted SO (no sales order / Tambahan left)
// are left out: their stock was put back by DELETE_SO.
//
// Sales Orders Completed — every SO whose last shipping (truck leave, see
// lib/truckTimes.ts) falls inside the office day and that is COMPLETE the
// same way the Sales Orders page decides it: every line shipped in full and
// no active Tambahan. Time needed = first picking → last shipping.

import { db } from "@/lib/db";
import {
  items,
  locationStockEvents as e,
  otherTransactions,
  palletEvents,
  pallets,
  salesOrderItems,
  salesOrders,
  salesOrderTypes,
  settings,
  tambahanOrders,
} from "@/db/schema";
import { and, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { formatSoDisplay } from "@/lib/soDisplay";
import { getTruckTimesInWindow } from "@/lib/truckTimes";
import {
  DEFAULT_OFFICE_DAY_START_MINUTES,
  currentOfficeDate,
  formatOfficeHour,
  formatWib,
  officeDayWindow,
} from "@/lib/officeDay";

export type DetailLine = {
  ref: string; // MO number, SO number as displayed, Tambahan number, or ZXCKWMS code
  kind: "MO" | "SO" | "TAMBAHAN" | "OTHER";
  note: string | null; // converted SO number (Tambahan), or transaction notes
  quantity: number;
};

export type MovementRow = {
  itemId: number;
  sku: string;
  name: string;
  productionIn: number;
  otherIn: number;
  totalIn: number;
  salesOut: number;
  otherOut: number;
  totalOut: number;
  inbound: DetailLine[]; // MOs, then Other Inbound transactions
  outbound: DetailLine[]; // SOs / Tambahan, then Other Outbound transactions
};

export type CompletedOrder = {
  salesOrderId: number;
  document: string; // e.g. "SO-202610000658", "HPT202610000506"
  typeName: string | null;
  firstPick: string | null; // WIB "YYYY-MM-DD HH:MM:SS"
  lastShip: string; // WIB "YYYY-MM-DD HH:MM:SS"
  durationMs: number | null; // last ship − first pick
  cartons: number; // shipped against the SO's lines
};

export type DashboardData = {
  date: string; // office day shown
  today: string; // the office day running right now
  officeHour: string; // "07:00"
  windowStart: string; // WIB "YYYY-MM-DD HH:MM"
  windowEnd: string; // WIB — the shift end
  isCurrent: boolean; // window still running → data is until now
  generatedAt: string; // WIB, when this was read
  movement: MovementRow[];
  completedOrders: CompletedOrder[];
};

export async function getOfficeDayStartMinutes(): Promise<number> {
  const [row] = await db.select({ v: settings.officeDayStartMinutes }).from(settings).limit(1);
  return row?.v ?? DEFAULT_OFFICE_DAY_START_MINUTES;
}

const qtySum = sql<number>`coalesce(sum(${e.quantity}), 0)`.mapWith(Number);

type Bucket = "productionIn" | "otherIn" | "salesOut" | "otherOut";
type SkuInfo = { itemId: number; sku: string; name: string };

// Folds every (SKU, reference) line into one row per SKU. Lines that net to
// zero (e.g. a shipment corrected back out) are dropped from the details,
// and a SKU with no movement left at all is dropped.
function buildMovement(
  groups: { bucket: Bucket; rows: (SkuInfo & DetailLine)[] }[]
): MovementRow[] {
  const map = new Map<number, MovementRow>();
  for (const { bucket, rows } of groups) {
    for (const r of rows) {
      let row = map.get(r.itemId);
      if (!row) {
        row = {
          itemId: r.itemId,
          sku: r.sku,
          name: r.name,
          productionIn: 0,
          otherIn: 0,
          totalIn: 0,
          salesOut: 0,
          otherOut: 0,
          totalOut: 0,
          inbound: [],
          outbound: [],
        };
        map.set(r.itemId, row);
      }
      row[bucket] += r.quantity;
      if (r.quantity === 0) continue;
      const line: DetailLine = { ref: r.ref, kind: r.kind, note: r.note, quantity: r.quantity };
      (bucket === "productionIn" || bucket === "otherIn" ? row.inbound : row.outbound).push(line);
    }
  }

  const kindOrder: Record<DetailLine["kind"], number> = { MO: 0, SO: 1, TAMBAHAN: 2, OTHER: 3 };
  const byKindThenQty = (a: DetailLine, b: DetailLine) =>
    kindOrder[a.kind] - kindOrder[b.kind] || b.quantity - a.quantity || a.ref.localeCompare(b.ref);

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalIn: r.productionIn + r.otherIn,
      totalOut: r.salesOut + r.otherOut,
      inbound: r.inbound.sort(byKindThenQty),
      outbound: r.outbound.sort(byKindThenQty),
    }))
    .filter((r) => r.totalIn !== 0 || r.totalOut !== 0 || r.inbound.length > 0 || r.outbound.length > 0)
    .sort((a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut) || a.sku.localeCompare(b.sku));
}

async function getMovement(inWindow: ReturnType<typeof and>): Promise<MovementRow[]> {
  const otherSelect = {
    itemId: e.itemId,
    sku: items.sku,
    name: items.name,
    code: otherTransactions.transactionCode,
    notes: otherTransactions.notes,
    quantity: qtySum,
  };

  const [production, otherIn, shippedRows, otherOut] = await Promise.all([
    db
      .select({
        workOrderNumber: e.workOrderNumber,
        itemId: e.itemId,
        sku: items.sku,
        name: items.name,
        quantity: qtySum,
      })
      .from(e)
      .innerJoin(items, eq(e.itemId, items.id))
      .where(and(inArray(e.type, ["INBOUND", "DEFAULT_INBOUND"]), inWindow))
      .groupBy(e.workOrderNumber, e.itemId, items.sku, items.name),

    db
      .select(otherSelect)
      .from(e)
      .innerJoin(items, eq(e.itemId, items.id))
      .leftJoin(otherTransactions, eq(e.otherTransactionId, otherTransactions.id))
      .where(and(eq(e.type, "OTHER_INBOUND"), inWindow))
      .groupBy(e.itemId, items.sku, items.name, otherTransactions.transactionCode, otherTransactions.notes),

    db
      .select({
        itemId: e.itemId,
        sku: items.sku,
        name: items.name,
        soNumber: salesOrders.soNumber,
        typeName: salesOrderTypes.name,
        typePrefix: salesOrderTypes.numberPrefix,
        tambahanNumber: tambahanOrders.tambahanNumber,
        convertedSoNumber: tambahanOrders.convertedSoNumber,
        quantity: qtySum,
      })
      .from(e)
      .innerJoin(items, eq(e.itemId, items.id))
      .leftJoin(salesOrders, eq(e.salesOrderId, salesOrders.id))
      .leftJoin(salesOrderTypes, eq(salesOrders.salesOrderTypeId, salesOrderTypes.id))
      .leftJoin(tambahanOrders, eq(e.tambahanOrderId, tambahanOrders.id))
      .where(and(eq(e.type, "SHIP"), or(isNotNull(e.salesOrderId), isNotNull(e.tambahanOrderId)), inWindow))
      .groupBy(
        e.itemId,
        items.sku,
        items.name,
        e.salesOrderId,
        salesOrders.soNumber,
        salesOrderTypes.name,
        salesOrderTypes.numberPrefix,
        e.tambahanOrderId,
        tambahanOrders.tambahanNumber,
        tambahanOrders.convertedSoNumber
      ),

    db
      .select(otherSelect)
      .from(e)
      .innerJoin(items, eq(e.itemId, items.id))
      .leftJoin(otherTransactions, eq(e.otherTransactionId, otherTransactions.id))
      .where(and(eq(e.type, "OTHER_OUTBOUND"), inWindow))
      .groupBy(e.itemId, items.sku, items.name, otherTransactions.transactionCode, otherTransactions.notes),
  ]);

  const otherLine = (r: (typeof otherIn)[number]) => ({
    itemId: r.itemId,
    sku: r.sku,
    name: r.name,
    ref: r.code ?? "—",
    kind: "OTHER" as const,
    note: r.notes?.trim() || null,
    quantity: r.quantity,
  });

  return buildMovement([
    {
      bucket: "productionIn",
      rows: production.map((r) => ({
        itemId: r.itemId,
        sku: r.sku,
        name: r.name,
        ref: r.workOrderNumber ?? "—",
        kind: "MO" as const,
        note: null,
        quantity: r.quantity,
      })),
    },
    { bucket: "otherIn", rows: otherIn.map(otherLine) },
    {
      bucket: "salesOut",
      rows: shippedRows.map((r) => {
        const base = { itemId: r.itemId, sku: r.sku, name: r.name, quantity: r.quantity };
        if (r.soNumber) {
          const type = r.typeName ? { name: r.typeName, numberPrefix: r.typePrefix } : null;
          // The type is already in the displayed number ("SO-…", "HPT…").
          return { ...base, ref: formatSoDisplay(r.soNumber, type), kind: "SO" as const, note: null };
        }
        return {
          ...base,
          ref: r.tambahanNumber ?? "—",
          kind: "TAMBAHAN" as const,
          note: r.convertedSoNumber ? `→ ${r.convertedSoNumber}` : null,
        };
      }),
    },
    { bucket: "otherOut", rows: otherOut.map(otherLine) },
  ]);
}

// startWall / endWall: WIB "YYYY-MM-DD HH:MM:SS"; start inclusive, end
// exclusive.
async function getCompletedOrders(startWall: string, endWall: string): Promise<CompletedOrder[]> {
  // SOs whose first pick or last ship is in the window (bounds inclusive),
  // narrowed to the ones whose last ship is.
  const truckTimes = await getTruckTimesInWindow(db, startWall, endWall);
  const candidates = Array.from(truckTimes.entries()).filter(
    ([, t]) => t.truckLeaveTime !== null && t.truckLeaveTime >= startWall && t.truckLeaveTime < endWall
  );
  if (candidates.length === 0) return [];
  const ids = candidates.map(([id]) => id);

  // Same completeness inputs as the Sales Orders page (app/sales-orders/
  // page.tsx): ordered lines, shipped = OUTBOUND pallet events per
  // (SO, item), and whether an ACTIVE Tambahan is still open.
  const [orders, lines, shippedRows, activeTambahan] = await Promise.all([
    db
      .select({
        id: salesOrders.id,
        soNumber: salesOrders.soNumber,
        typeName: salesOrderTypes.name,
        typePrefix: salesOrderTypes.numberPrefix,
      })
      .from(salesOrders)
      .leftJoin(salesOrderTypes, eq(salesOrders.salesOrderTypeId, salesOrderTypes.id))
      .where(inArray(salesOrders.id, ids)),

    db
      .select({
        salesOrderId: salesOrderItems.salesOrderId,
        itemId: salesOrderItems.itemId,
        quantity: salesOrderItems.quantity,
      })
      .from(salesOrderItems)
      .where(inArray(salesOrderItems.salesOrderId, ids)),

    db
      .select({
        salesOrderId: palletEvents.salesOrderId,
        itemId: pallets.itemId,
        quantity: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)`.mapWith(Number),
      })
      .from(palletEvents)
      .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
      .where(and(eq(palletEvents.type, "OUTBOUND"), inArray(palletEvents.salesOrderId, ids)))
      .groupBy(palletEvents.salesOrderId, pallets.itemId),

    db
      .select({ parentSalesOrderId: tambahanOrders.parentSalesOrderId })
      .from(tambahanOrders)
      .where(and(inArray(tambahanOrders.parentSalesOrderId, ids), eq(tambahanOrders.status, "ACTIVE"))),
  ]);

  const shipped = new Map<string, number>();
  for (const r of shippedRows) shipped.set(`${r.salesOrderId}-${r.itemId}`, r.quantity);

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

  const openTambahan = new Set(activeTambahan.map((r) => r.parentSalesOrderId));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const result: CompletedOrder[] = [];
  for (const [id, t] of candidates) {
    const order = orderById.get(id);
    const orderLines = linesByOrder.get(id) ?? [];
    if (!order || orderLines.length === 0 || openTambahan.has(id)) continue;
    const complete = orderLines.every((l) => (shipped.get(`${id}-${l.itemId}`) ?? 0) >= l.quantity);
    if (!complete) continue;

    const type = order.typeName ? { name: order.typeName, numberPrefix: order.typePrefix } : null;
    result.push({
      salesOrderId: id,
      document: formatSoDisplay(order.soNumber, type),
      typeName: order.typeName,
      firstPick: t.truckEnterTime,
      lastShip: t.truckLeaveTime!,
      durationMs: t.durationMs,
      cartons: orderLines.reduce((sum, l) => sum + (shipped.get(`${id}-${l.itemId}`) ?? 0), 0),
    });
  }

  // Most recently finished first.
  return result.sort((a, b) => b.lastShip.localeCompare(a.lastShip));
}

export async function getDashboardData(requestedDate?: string | null): Promise<DashboardData> {
  const startMinutes = await getOfficeDayStartMinutes();
  const now = new Date();
  const today = currentOfficeDate(startMinutes, now);
  const date = requestedDate ?? today;
  const win = officeDayWindow(date, startMinutes, now);

  const base = {
    date,
    today,
    officeHour: formatOfficeHour(startMinutes),
    windowStart: formatWib(win.from),
    windowEnd: formatWib(win.to),
    isCurrent: win.isCurrent,
    generatedAt: formatWib(now),
  };

  if (win.isFuture) {
    return { ...base, movement: [], completedOrders: [] };
  }

  const inWindow = and(gte(e.createdAt, win.from), lt(e.createdAt, win.to));
  const [movement, completedOrders] = await Promise.all([
    getMovement(inWindow),
    getCompletedOrders(`${base.windowStart}:00`, `${base.windowEnd}:00`),
  ]);

  return { ...base, movement, completedOrders };
}
