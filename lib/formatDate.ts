// `.toLocaleString()` on its own follows the browser's locale, which for
// many locales (e.g. en-US) defaults to 12-hour AM/PM. This forces a
// consistent 24-hour clock everywhere it's used, regardless of the
// viewer's browser locale settings.
export function formatDateTime24(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}