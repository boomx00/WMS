// A Total Stock column's name in the language picked in the top bar: its
// Indonesian / Chinese name when one is set on Settings → Total Stock
// Columns, otherwise its (English) name. Safe to use on the server and in
// the browser.

import type { Language } from "@/lib/language";

export type ColumnNames = { name: string; nameId?: string | null; nameZh?: string | null };

export function columnNameFor(column: ColumnNames, language: Language): string {
  if (language === "id" && column.nameId?.trim()) return column.nameId;
  if (language === "zh" && column.nameZh?.trim()) return column.nameZh;
  return column.name;
}
