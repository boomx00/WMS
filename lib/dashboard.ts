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
// Sales Orders — two kinds of SO, as they stood at the end of the office day:
//   FINISHED     last shipping (truck leave, see lib/truckTimes.ts) falls
//                inside the office day and the SO is COMPLETE the same way the
//                Sales Orders page decides it: every line shipped in full and
//                no active Tambahan. Time needed = first picking → last
//                shipping.
//   IN_PROGRESS  first picking was before the end of the office day, and the
//                SO wasn't finished by then: it still isn't complete, or it
//                shipped again (its own or a Tambahan's) after the day ended.
//                Times and cartons are as at the end of the day (or now, for
//                the running day); time needed = first picking → then.

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
import { NO_TRUCK_TIMES, getTruckTimes, getTruckTimesInWindow } from "@/lib/truckTimes";
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

export type OrderStatus = "IN_PROGRESS" | "FINISHED";

export type DashboardOrder = {
  salesOrderId: number;
  document: string; // e.g. "SO-202610000658", "HPT202610000506"
  typeName: string | null;
  status: OrderStatus;
  firstPick: string | null; // WIB "YYYY-MM-DD HH:MM:SS"
  lastShip: string | null; // WIB "YYYY-MM-DD HH:MM:SS"; null = nothing shipped yet
  // FINISHED: last ship − first pick. IN_PROGRESS: first pick → end of the
  // office day (or now, while it's running) — the time so far.
  durationMs: number | null;
  shipped: number; // cartons shipped against the SO's lines, as at the end of the day
  ordered: number; // cartons on the SO's lines
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
  orders: DashboardOrder[]; // in progress (longest-running first), then finished (latest first)
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

// The office day's sales orders: FINISHED ones and IN_PROGRESS ones (see the
// top of this file). from / to: the office day as UTC instants; startWall /
// endWall: the same as WIB "YYYY-MM-DD HH:MM:SS". Start inclusive, end
// exclusive.
async function getOrders(
  from: Date,
  to: Date,
  startWall: string,
  endWall: string,
  now: Date
): Promise<DashboardOrder[]> {
  const t = tambahanOrders;

  // SOs that shipped (their own SHIP or a Tambahan's) after the day ended —
  // so weren't finished at its end. Empty for the running day.
  const shippedAfterDay = sql`(select distinct coalesce(${e.salesOrderId}, ${t.parentSalesOrderId}) from ${e} left join ${t} on ${e.tambahanOrderId} = ${t.id} where ${e.type} = 'SHIP' and ${e.quantity} > 0 and ${gte(e.createdAt, to)})`;

  // A line still short of its ordered quantity (shipped = OUTBOUND pallet
  // events, same as the Sales Orders page).
  const hasUnshippedLine = sql`exists (select 1 from ${salesOrderItems} where ${salesOrderItems.salesOrderId} = ${salesOrders.id} and ${salesOrderItems.quantity} > coalesce((select sum(${palletEvents.quantity}) from ${palletEvents} inner join ${pallets} on ${palletEvents.palletId} = ${pallets.id} where ${palletEvents.type} = 'OUTBOUND' and ${palletEvents.salesOrderId} = ${salesOrderItems.salesOrderId} and ${pallets.itemId} = ${salesOrderItems.itemId}), 0))`;

  const hasActiveTambahan = sql`exists (select 1 from ${t} where ${t.parentSalesOrderId} = ${salesOrders.id} and ${t.status} = 'ACTIVE')`;

  // Picked (its own PICKING, not a Tambahan's) before the day ended.
  const pickedBeforeEnd = sql`exists (select 1 from ${e} where ${e.salesOrderId} = ${salesOrders.id} and ${e.type} in ('PICKING', 'DEFAULT_PICKING') and ${e.quantity} > 0 and ${lt(e.createdAt, to)})`;

  const [windowTimes, openRows] = await Promise.all([
    // SOs whose first pick or last ship is in the day (bounds inclusive);
    // narrowed below to the ones whose last ship is.
    getTruckTimesInWindow(db, startWall, endWall),

    db
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(
        sql`${pickedBeforeEnd} and (${hasUnshippedLine} or ${hasActiveTambahan} or ${salesOrders.id} in ${shippedAfterDay})`
      ),
  ]);

  const finishCandidates = Array.from(windowTimes.entries()).filter(
    ([, tt]) => tt.truckLeaveTime !== null && tt.truckLeaveTime >= startWall && tt.truckLeaveTime < endWall
  );
  const ids = Array.from(new Set([...finishCandidates.map(([id]) => id), ...openRows.map((r) => r.id)]));
  if (ids.length === 0) return [];

  const [orders, lines, shippedRows, activeTambahan, timesAtDayEnd] = await Promise.all([
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

    // Shipped per (SO, item): everything (decides COMPLETE, like the Sales
    // Orders page) and what had shipped by the end of the day (shown).
    db
      .select({
        salesOrderId: palletEvents.salesOrderId,
        itemId: pallets.itemId,
        quantity: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)`.mapWith(Number),
        byDayEnd: sql<number>`coalesce(sum(${palletEvents.quantity}) filter (where ${lt(palletEvents.createdAt, to)}), 0)`.mapWith(Number),
      })
      .from(palletEvents)
      .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
      .where(and(eq(palletEvents.type, "OUTBOUND"), inArray(palletEvents.salesOrderId, ids)))
      .groupBy(palletEvents.salesOrderId, pallets.itemId),

    db
      .select({ parentSalesOrderId: t.parentSalesOrderId })
      .from(t)
      .where(and(inArray(t.parentSalesOrderId, ids), eq(t.status, "ACTIVE"))),

    // First pick / last ship as they stood at the end of the day.
    getTruckTimes(db, ids, to),
  ]);

  const shipped = new Map<string, { all: number; byDayEnd: number }>();
  for (const r of shippedRows) shipped.set(`${r.salesOrderId}-${r.itemId}`, { all: r.quantity, byDayEnd: r.byDayEnd });

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

  const openTambahan = new Set(activeTambahan.map((r) => r.parentSalesOrderId));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const candidateTimes = new Map(finishCandidates);
  const openIds = new Set(openRows.map((r) => r.id));

  // Time so far for an order in progress: up to now while the day runs.
  const dayEndMs = Math.min(now.getTime(), to.getTime());
  const wibToMs = (wall: string) => Date.parse(`${wall.replace(" ", "T")}+07:00`);

  const result: DashboardOrder[] = [];
  for (const id of ids) {
    const order = orderById.get(id);
    if (!order) continue;
    const orderLines = linesByOrder.get(id) ?? [];
    const shippedOf = (itemId: number) => shipped.get(`${id}-${itemId}`) ?? { all: 0, byDayEnd: 0 };

    const complete =
      orderLines.length > 0 &&
      !openTambahan.has(id) &&
      orderLines.every((l) => shippedOf(l.itemId).all >= l.quantity);
    const finishedTimes = complete ? candidateTimes.get(id) : undefined;

    const type = order.typeName ? { name: order.typeName, numberPrefix: order.typePrefix } : null;
    const common = {
      salesOrderId: id,
      document: formatSoDisplay(order.soNumber, type),
      typeName: order.typeName,
      ordered: orderLines.reduce((sum, l) => sum + l.quantity, 0),
      shipped: orderLines.reduce((sum, l) => sum + shippedOf(l.itemId).byDayEnd, 0),
    };

    if (finishedTimes) {
      result.push({
        ...common,
        status: "FINISHED",
        firstPick: finishedTimes.truckEnterTime,
        lastShip: finishedTimes.truckLeaveTime,
        durationMs: finishedTimes.durationMs,
      });
    } else if (openIds.has(id)) {
      // (A window candidate that isn't COMPLETE is in openIds too — it has an
      // unshipped line or an active Tambahan.)
      const tt = timesAtDayEnd.get(id) ?? NO_TRUCK_TIMES;
      if (!tt.truckEnterTime) continue; // no picking yet — not started
      result.push({
        ...common,
        status: "IN_PROGRESS",
        firstPick: tt.truckEnterTime,
        lastShip: tt.truckLeaveTime,
        durationMs: Math.max(0, dayEndMs - wibToMs(tt.truckEnterTime)),
      });
    }
  }

  // In progress first, longest-running on top; then finished, latest first.
  return result.sort((a, b) => {
    if (a.status !== b.status) return a.status === "IN_PROGRESS" ? -1 : 1;
    if (a.status === "IN_PROGRESS") return (a.firstPick ?? "").localeCompare(b.firstPick ?? "");
    return (b.lastShip ?? "").localeCompare(a.lastShip ?? "");
  });
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
    return { ...base, movement: [], orders: [] };
  }

  const inWindow = and(gte(e.createdAt, win.from), lt(e.createdAt, win.to));
  const [movement, orders] = await Promise.all([
    getMovement(inWindow),
    getOrders(win.from, win.to, `${base.windowStart}:00`, `${base.windowEnd}:00`, now),
  ]);

  return { ...base, movement, orders };
}