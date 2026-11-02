// The "office day" the Dashboard reports on: a 24-hour window that starts
// at the office hour set on Settings (default 07:00 WIB) and runs to the
// same time the next day. Production works 07:00 → 07:00, so:
//   opened 28 Oct 04:00 → office day 27 Oct (27 Oct 07:00 → now)
//   picked 20 Oct       → 20 Oct 07:00 → 21 Oct 07:00
//
// Safe to import from client code (no DB access here). Times are worked out
// in WIB (UTC+7, no daylight saving) — the same fixed offset as
// DISPLAY_TZ_OFFSET_HOURS in lib/ledger.ts — and stored / queried as UTC.

export const DEFAULT_OFFICE_DAY_START_MINUTES = 7 * 60; // 07:00

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidOfficeDayStart(minutes: unknown): minutes is number {
  return typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 0 && minutes < 24 * 60;
}

export function isValidDateParam(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 420 → "07:00"
export function formatOfficeHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// An instant as a WIB wall-clock string, "YYYY-MM-DD HH:MM" (24-hour).
export function formatWib(d: Date): string {
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

// "YYYY-MM-DD" ± n days.
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Which office day `now` falls in: before the start hour it still belongs
// to the previous day's shift.
export function currentOfficeDate(startMinutes: number, now: Date = new Date()): string {
  const wall = new Date(now.getTime() + WIB_OFFSET_MS); // UTC fields = WIB wall clock
  const minutesNow = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const date = wall.toISOString().slice(0, 10);
  return minutesNow < startMinutes ? shiftDate(date, -1) : date;
}

export type OfficeDayWindow = {
  date: string; // office day, YYYY-MM-DD
  from: Date; // start, inclusive (UTC instant)
  to: Date; // start + 24h, exclusive (UTC instant)
  isCurrent: boolean; // the shift is still running — data is "until now"
  isFuture: boolean; // hasn't started yet
};

export function officeDayWindow(date: string, startMinutes: number, now: Date = new Date()): OfficeDayWindow {
  const [y, m, d] = date.split("-").map(Number);
  const fromMs = Date.UTC(y, m - 1, d, 0, startMinutes) - WIB_OFFSET_MS;
  const toMs = fromMs + DAY_MS;
  const nowMs = now.getTime();
  return {
    date,
    from: new Date(fromMs),
    to: new Date(toMs),
    isCurrent: nowMs >= fromMs && nowMs < toMs,
    isFuture: fromMs > nowMs,
  };
}
