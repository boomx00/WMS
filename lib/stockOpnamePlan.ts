export type ProductionShift = "A" | "B";
export type WarehouseShift = "08-16" | "16-24" | "24-08";

export interface ProductionPlanRow {
  /** YYYY-MM-DD. Shift B on 2026-11-02 runs 19:00 Nov 2 to 07:00 Nov 3. */
  date: string;
  shift: ProductionShift;
  sku: string;
}

export interface ShippingPlanRow {
  docNo: string;
  sku: string;
  status: string;
}

export interface StockRow {
  sku: string;
  /** Good Stock quantity in the WMS (see getGoodStock). Repeated SKUs are added up. */
  qty: number;
  name?: string | null;
}

export interface CountedSku {
  sku: string;
  /** YYYY-MM-DD of the stock opname. */
  date: string;
}

export interface StockOpnamePlanInput {
  /** YYYY-MM-DD of the plan. */
  date: string;
  /** Every SKU that can be counted, with its system stock. */
  stock: StockRow[];
  /** Include the next day's rows too: the 24-08 shift overlaps its Shift A from 07:00 to 08:00. */
  productionPlan: ProductionPlanRow[];
  shippingPlan: ShippingPlanRow[];
  /** Past counts. Only those in the same Monday-Sunday week as `date` are used. */
  counted?: CountedSku[];
  /** The warehouse shifts that will count. Defaults to all three. */
  warehouseShifts?: WarehouseShift[];
  /** Plan codes that mean the same product as a stock SKU, e.g. { "5020004007": "14013075701" }. */
  skuAliases?: Record<string, string>;
  /** SKUs with less stock than this go to 08-16 (Shift A) when it is free. Defaults to 1000. */
  shiftAMaxStock?: number;
  /** The stock a SKU needs to count as high stock for 24-08. Defaults to 1500. */
  shift3MinStock?: number;
  /** How many high-stock SKUs 24-08 should have, highest stock first. Defaults to 4. */
  shift3MinSkus?: number;
}

export interface PlannedSku {
  sku: string;
  name: string | null;
  stockQty: number;
  /** The sales orders holding this SKU. Empty when it is not on the shipping plan. */
  docNos: string[];
  /** Every warehouse shift with no production of this SKU. */
  availableShifts: WarehouseShift[];
}

export type SkipReason =
  | "COUNTED_THIS_WEEK"
  | "IN_PRODUCTION"
  | "ON_OTHER_ORDERS";

export interface SkippedSku {
  sku: string;
  name: string | null;
  reason: SkipReason;
  /** The sales orders involved, when the reason comes from the shipping plan. */
  docNos: string[];
}

export interface StockOpnamePlan {
  date: string;
  weekStart: string;
  /**
   * Each SKU appears once. Low-stock SKUs go to 08-16 and the rest to 16-24, unless
   * production leaves only one shift free. High-stock SKUs then move to 24-08 until it
   * has `shift3MinSkus` of them, counting those production already forces there.
   */
  sessions: Record<WarehouseShift, PlannedSku[]>;
  skipped: SkippedSku[];
}

const ALL_WAREHOUSE_SHIFTS: WarehouseShift[] = ["08-16", "16-24", "24-08"];
const SHIFT_A: WarehouseShift = "08-16";
const SHIFT_3: WarehouseShift = "24-08";
export const DEFAULT_SHIFT_A_MAX_STOCK = 1000;
export const DEFAULT_SHIFT_3_MIN_STOCK = 1500;
export const DEFAULT_SHIFT_3_MIN_SKUS = 4;

/** Hours from the start of the plan date. 24-08 runs into the next morning. */
const WAREHOUSE_WINDOWS: Record<WarehouseShift, [number, number]> = {
  "08-16": [8, 16],
  "16-24": [16, 24],
  "24-08": [24, 32],
};

const PRODUCTION_WINDOWS: Record<ProductionShift, [number, number]> = {
  A: [7, 19],
  B: [19, 31],
};

const MS_PER_DAY = 86_400_000;

function toDayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return Date.UTC(+match[1], +match[2] - 1, +match[3]) / MS_PER_DAY;
}

function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function getWeekStart(day: number): number {
  // Day 0 (1970-01-01) was a Thursday, so Monday-based weekday = (day + 3) mod 7.
  return day - (((day + 3) % 7) + 7) % 7;
}

/** The Monday and Sunday (YYYY-MM-DD) of the week `date` falls in. */
export function getWeekRange(date: string): { from: string; to: string } {
  const start = getWeekStart(toDayNumber(date));
  return { from: fromDayNumber(start), to: fromDayNumber(start + 6) };
}

function normalizeSku(sku: string): string {
  return String(sku).trim().toUpperCase();
}

function isStandBy(status: string): boolean {
  return String(status).toLowerCase().replace(/[\s_-]/g, "") === "standby";
}

function sortBySku<T extends { sku: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.sku.localeCompare(b.sku));
}

export function planStockOpname(input: StockOpnamePlanInput): StockOpnamePlan {
  const planDay = toDayNumber(input.date);
  const weekStart = getWeekStart(planDay);
  const shifts = input.warehouseShifts ?? ALL_WAREHOUSE_SHIFTS;
  const shiftAMaxStock = input.shiftAMaxStock ?? DEFAULT_SHIFT_A_MAX_STOCK;
  const shift3MinStock = input.shift3MinStock ?? DEFAULT_SHIFT_3_MIN_STOCK;
  const shift3MinSkus = input.shift3MinSkus ?? DEFAULT_SHIFT_3_MIN_SKUS;

  const aliases = new Map<string, string>();
  for (const [code, sku] of Object.entries(input.skuAliases ?? {})) {
    aliases.set(normalizeSku(code), normalizeSku(sku));
  }
  const resolveSku = (sku: string): string => {
    const normalized = normalizeSku(sku);
    return aliases.get(normalized) ?? normalized;
  };

  // Filter 1: counted earlier in this Monday-Sunday week.
  const countedThisWeek = new Set<string>();
  for (const row of input.counted ?? []) {
    const day = toDayNumber(row.date);
    if (day >= weekStart && day < weekStart + 7) countedThisWeek.add(resolveSku(row.sku));
  }

  // Filter 2: the warehouse shifts blocked by production of each SKU.
  const blockedShifts = new Map<string, Set<WarehouseShift>>();
  for (const row of input.productionPlan) {
    const offset = (toDayNumber(row.date) - planDay) * 24;
    const [prodStart, prodEnd] = PRODUCTION_WINDOWS[row.shift];
    for (const shift of ALL_WAREHOUSE_SHIFTS) {
      const [start, end] = WAREHOUSE_WINDOWS[shift];
      if (prodStart + offset < end && start < prodEnd + offset) {
        const sku = resolveSku(row.sku);
        if (!blockedShifts.has(sku)) blockedShifts.set(sku, new Set());
        blockedShifts.get(sku)!.add(shift);
      }
    }
  }

  // Filter 3: the sales orders holding each SKU, and which of them are stand by.
  const docsBySku = new Map<string, Set<string>>();
  const standByDocsBySku = new Map<string, Set<string>>();
  for (const row of input.shippingPlan) {
    const sku = resolveSku(row.sku);
    const docNo = String(row.docNo).trim();
    if (!docsBySku.has(sku)) docsBySku.set(sku, new Set());
    docsBySku.get(sku)!.add(docNo);
    if (isStandBy(row.status)) {
      if (!standByDocsBySku.has(sku)) standByDocsBySku.set(sku, new Set());
      standByDocsBySku.get(sku)!.add(docNo);
    }
  }

  const sessions: Record<WarehouseShift, PlannedSku[]> = {
    "08-16": [],
    "16-24": [],
    "24-08": [],
  };
  const skipped: SkippedSku[] = [];
  const planned: PlannedSku[] = [];
  const stockBySku = new Map<string, number>();
  const nameBySku = new Map<string, string>();
  for (const row of input.stock) {
    const sku = resolveSku(row.sku);
    stockBySku.set(sku, (stockBySku.get(sku) ?? 0) + (Number(row.qty) || 0));
    if (row.name && !nameBySku.has(sku)) nameBySku.set(sku, row.name);
  }

  for (const [sku, stockQty] of stockBySku) {
    const docNos = [...(docsBySku.get(sku) ?? [])].sort();
    const name = nameBySku.get(sku) ?? null;

    if (countedThisWeek.has(sku)) {
      skipped.push({ sku, name, reason: "COUNTED_THIS_WEEK", docNos });
      continue;
    }

    const blocked = blockedShifts.get(sku);
    const availableShifts = shifts.filter((shift) => !blocked?.has(shift));
    if (availableShifts.length === 0) {
      skipped.push({ sku, name, reason: "IN_PRODUCTION", docNos });
      continue;
    }

    if (standByDocsBySku.has(sku) && docNos.length > 1) {
      skipped.push({ sku, name, reason: "ON_OTHER_ORDERS", docNos });
      continue;
    }

    planned.push({ sku, name, stockQty, docNos, availableShifts });
  }

  const firstChoice = (row: PlannedSku): WarehouseShift => {
    if (row.availableShifts.includes(SHIFT_A) && row.stockQty < shiftAMaxStock) return SHIFT_A;
    return row.availableShifts.find((shift) => shift !== SHIFT_A) ?? row.availableShifts[0];
  };

  // Top up 24-08 with the highest-stock SKUs that are free for it.
  const isHighStock = (row: PlannedSku) => row.stockQty >= shift3MinStock;
  const forcedHighStock = planned.filter((row) => firstChoice(row) === SHIFT_3 && isHighStock(row));
  const movable = planned
    .filter((row) => firstChoice(row) !== SHIFT_3 && row.availableShifts.includes(SHIFT_3) && isHighStock(row))
    .sort((a, b) => b.stockQty - a.stockQty || a.sku.localeCompare(b.sku));
  const movedToShift3 = new Set(movable.slice(0, Math.max(0, shift3MinSkus - forcedHighStock.length)));

  for (const row of planned) {
    sessions[movedToShift3.has(row) ? SHIFT_3 : firstChoice(row)].push(row);
  }

  for (const shift of ALL_WAREHOUSE_SHIFTS) sortBySku(sessions[shift]);

  return {
    date: fromDayNumber(planDay),
    weekStart: fromDayNumber(weekStart),
    sessions,
    skipped: sortBySku(skipped),
  };
}
