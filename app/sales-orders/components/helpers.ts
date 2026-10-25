// The truck-time columns are stored (and returned by Drizzle, in string mode)
// as a literal wall-clock string — e.g. "2026-09-29 08:44:00" — with no
// timezone attached. Never wrap these in `new Date(...)`: that hands them
// to the JS Date engine, which stamps them UTC and then re-shifts them by
// the browser's own offset on display. Format as plain strings instead.

// Stored value -> the "YYYY-MM-DDTHH:mm" shape <input type="datetime-local"> wants.
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

// Stored value -> display string, matching the project's 24-hour-clock convention.
export function formatTruckTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [datePart, timePart] = value.replace(" ", "T").split("T");
  const [year, month, day] = datePart.split("-");
  const hm = (timePart ?? "00:00").slice(0, 5);
  return `${day}/${month}/${year} ${hm}`;
}