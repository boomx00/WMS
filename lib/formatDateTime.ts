// Fixed display timezone (Jakarta / Bangkok, UTC+7) for timestamps shown in
// the web app. Passing the timeZone explicitly makes the server render and
// the browser render identical, regardless of where either one runs — a bare
// toLocaleString() uses the machine's timezone, which on the VPS is UTC.
const DISPLAY_TIME_ZONE = "Asia/Jakarta";

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}