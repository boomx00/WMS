import { useLanguage } from "@/lib/LanguageContext";

// Display formatting: dates, quantities, opname numbers, Excel sheet names.

// "SOSKU-ANDI-4" -> "ANDI-4" for the narrow SOSKU column (the full number
// is in the tooltip and the Detail popup).
export const shortOpname = (opnameNumber: string) =>
  opnameNumber.startsWith("SOSKU-") ? opnameNumber.slice("SOSKU-".length) : opnameNumber;

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Dates follow the language picked in the top bar.
export const DATE_LOCALES: Record<string, string> = { en: "en-GB", id: "id-ID", zh: "zh-CN" };

export const useDateLocale = () => DATE_LOCALES[useLanguage().language] ?? "en-GB";

export function formatDay(date: string, locale = "en-GB"): { day: string; weekday: string } {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }),
    weekday: d.toLocaleDateString(locale, { weekday: "short" }),
  };
}

// Longest adjustment note (same limit as /api/stock-opname/summary/adjustment).
export const NOTE_MAX_LENGTH = 1000;

export const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

// Excel sheet names: max 31 characters, none of [ ] : * ? / \
export const sheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet1";
