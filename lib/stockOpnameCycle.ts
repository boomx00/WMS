// The stock opname cycle (Settings → General): a SKU opnamed in the current
// cycle isn't planned again until the next one. Safe to use in the browser.

export type StockOpnameCycleType = "WEEKLY" | "MONTHLY";

export type StockOpnameCycle = {
  type: StockOpnameCycleType;
  // WEEKLY: 1 (Monday) to 7 (Sunday). MONTHLY: 1 to 31; in shorter months the
  // cycle starts on the month's last day instead.
  startDay: number;
};

export const DEFAULT_STOCK_OPNAME_CYCLE: StockOpnameCycle = { type: "WEEKLY", startDay: 1 };

const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  return Date.UTC(+match[1], +match[2] - 1, +match[3]) / MS_PER_DAY;
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidStockOpnameCycle(type: unknown, startDay: unknown): type is StockOpnameCycleType {
  if (typeof startDay !== "number" || !Number.isInteger(startDay) || startDay < 1) return false;
  if (type === "WEEKLY") return startDay <= 7;
  if (type === "MONTHLY") return startDay <= 31;
  return false;
}

// A saved cycle, or the default if it isn't a valid combination.
export function cleanStockOpnameCycle(type: unknown, startDay: unknown): StockOpnameCycle {
  return isValidStockOpnameCycle(type, startDay) ? { type, startDay: startDay as number } : DEFAULT_STOCK_OPNAME_CYCLE;
}

// The day a monthly cycle starts in one month. `month` may run past 0-11.
function monthlyStart(year: number, month: number, startDay: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(startDay, lastDay)) / MS_PER_DAY;
}

// The first and last day (YYYY-MM-DD) of the cycle `date` falls in.
export function getStockOpnameCycleRange(date: string, cycle: StockOpnameCycle): { from: string; to: string } {
  const day = toDayNumber(date);

  if (cycle.type === "WEEKLY") {
    // Day 0 (1970-01-01) was a Thursday, so Monday-based weekday = (day + 3) mod 7.
    const weekday = (((day + 3) % 7) + 7) % 7;
    const start = day - ((weekday - (cycle.startDay - 1) + 7) % 7);
    return { from: fromDayNumber(start), to: fromDayNumber(start + 6) };
  }

  const current = new Date(day * MS_PER_DAY);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const startsThisMonth = monthlyStart(year, month, cycle.startDay);
  const startMonth = day >= startsThisMonth ? month : month - 1;
  return {
    from: fromDayNumber(monthlyStart(year, startMonth, cycle.startDay)),
    to: fromDayNumber(monthlyStart(year, startMonth + 1, cycle.startDay) - 1),
  };
}
