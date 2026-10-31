// Server-only: the Dashboard's data for one office day (see lib/officeDay.ts).
// Read straight off the location_stock_events ledger:
//
//   Production in   INBOUND / DEFAULT_INBOUND (PDA pallet inbound, by MO)
//   Other in        OTHER_INBOUND  (Other Transactions → Inbound)
//   Shipped (SO)    SHIP against a sales order or Tambahan batch
//   Other out       OTHER_OUTBOUND (Other Transactions → Outbound)
//
// Quantities are summed as stored, so shipment corrections (negative SHIP
// rows) net out. SHIP rows of a deleted SO (no sales order / Tambahan left)
// are left out: their stock was put back by DELETE_SO.

import { db } from "@/lib/db";
import {
  items,
  locationStockEvents as e,
  otherTransactions,
  salesOrders,
  salesOrderTypes,
  settings,
  tambahanOrders,
} from "@/db/schema";
import { and, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { formatSoDisplay } from "@/lib/soDisplay";
import {
  DEFAULT_OFFICE_DAY_START_MINUTES,
  currentOfficeDate,
  formatOfficeHour,
  formatWib,
  officeDayWindow,
} from "@/lib/officeDay";

export type ProductionRow = {
  workOrderNumber: string | null;
  itemId: number;
  sku: string;
  name: string;
  quantity: number;
};

export type DetailLine = {
  ref: string; // SO number as displayed, Tambahan number, or ZXCKWMS code
  kind: "SO" | "TAMBAHAN" | "OTHER";
  note: string | null; // SO type, converted SO number, or transaction notes
  quantity: number;
};

export type SkuRow = {
  itemId: number;
  sku: string;
  name: string;
  quantity: number;
  details: DetailLine[];
};

export type DashboardData = {
  date: string; // office day shown
  today: string; // the office day running right now
  officeHour: string; // "07:00"
  windowStart: string; // WIB "YYYY-MM-DD HH:MM"
  windowEnd: string; // WIB — the shift end
  isCurrent: boolean; // window still running → data is until now
  generatedAt: string; // WIB, when this was read
  production: ProductionRow[];
  otherInbound: SkuRow[];
  shipped: SkuRow[];
  otherOutbound: SkuRow[];
};

export async function getOfficeDayStartMinutes(): Promise<number> {
  const [row] = await db.select({ v: settings.officeDayStartMinutes }).from(settings).limit(1);
  return row?.v ?? DEFAULT_OFFICE_DAY_START_MINUTES;
}

const qtySum = sql<number>`coalesce(sum(${e.quantity}), 0)`.mapWith(Number);

// One row per SKU, with what made it up underneath (details), biggest first.
// Lines that net to zero (e.g. a shipment corrected back out) are dropped,
// and so is a SKU with nothing left.
function bySku<T extends { itemId: number; sku: string; name: string; quantity: number }>(
  rows: T[],
  toDetail: (row: T) => Omit<DetailLine, "quantity">
): SkuRow[] {
  const map = new Map<number, SkuRow>();
  for (const r of rows) {
    let entry = map.get(r.itemId);
    if (!entry) {
      entry = { itemId: r.itemId, sku: r.sku, name: r.name, quantity: 0, details: [] };
      map.set(r.itemId, entry);
    }
    entry.quantity += r.quantity;
    if (r.quantity !== 0) entry.details.push({ ...toDetail(r), quantity: r.quantity });
  }
  return Array.from(map.values())
    .filter((s) => s.quantity !== 0 || s.details.length > 0)
    .map((s) => ({ ...s, details: s.details.sort((a, b) => b.quantity - a.quantity || a.ref.localeCompare(b.ref)) }))
    .sort((a, b) => b.quantity - a.quantity || a.sku.localeCompare(b.sku));
}

export async function getDashboardData(requestedDate?: string | null): Promise<DashboardData> {
  const startMinutes = await getOfficeDayStartMinutes();
  const now = new Date();
  const today = currentOfficeDate(startMinutes, now);
  const date = requestedDate ?? today;
  const win = officeDayWindow(date, startMinutes, now);

  const inWindow = and(gte(e.createdAt, win.from), lt(e.createdAt, win.to));

  const empty: Omit<DashboardData, "production" | "otherInbound" | "shipped" | "otherOutbound"> = {
    date,
    today,
    officeHour: formatOfficeHour(startMinutes),
    windowStart: formatWib(win.from),
    windowEnd: formatWib(win.to),
    isCurrent: win.isCurrent,
    generatedAt: formatWib(now),
  };

  if (win.isFuture) {
    return { ...empty, production: [], otherInbound: [], shipped: [], otherOutbound: [] };
  }

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
      .groupBy(e.workOrderNumber, e.itemId, items.sku, items.name)
      .orderBy(e.workOrderNumber, items.sku),

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
      .where(
        and(eq(e.type, "SHIP"), or(isNotNull(e.salesOrderId), isNotNull(e.tambahanOrderId)), inWindow)
      )
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

  const otherDetail = (r: { code: string | null; notes: string | null }) => ({
    ref: r.code ?? "—",
    kind: "OTHER" as const,
    note: r.notes?.trim() || null,
  });

  return {
    ...empty,
    production: production.filter((r) => r.quantity !== 0),
    otherInbound: bySku(otherIn, otherDetail),
    shipped: bySku(shippedRows, (r) => {
      if (r.soNumber) {
        const type = r.typeName ? { name: r.typeName, numberPrefix: r.typePrefix } : null;
        return { ref: formatSoDisplay(r.soNumber, type), kind: "SO", note: r.typeName };
      }
      return {
        ref: r.tambahanNumber ?? "—",
        kind: "TAMBAHAN",
        note: r.convertedSoNumber ? `→ ${r.convertedSoNumber}` : null,
      };
    }),
    otherOutbound: bySku(otherOut, otherDetail),
  };
}
