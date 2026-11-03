import * as XLSX from "xlsx";
import { headerKey } from "../_summary/k3File";
import type { ProductionPlanRow, ShippingPlanRow } from "@/lib/stockOpnamePlan";

// Reading the production plan and shipping plan Excel files into rows. Only
// visible sheets are read: planning workbooks keep old plans on hidden sheets
// with the same columns.

const cellText = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

// Excel date serials, YYYY-MM-DD and DD/MM/YYYY -> YYYY-MM-DD.
function toIsoDate(v: unknown): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null;
  }
  const s = cellText(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
}

// A shift cell: "A", "B", or both on one row, such as "A/B".
function toShifts(v: unknown): ("A" | "B")[] {
  const s = cellText(v).toUpperCase();
  if (!/^[AB]([\s/+&,-]*[AB])?$/.test(s)) return [];
  return (["A", "B"] as const).filter((shift) => s.includes(shift));
}

type Table = { rows: unknown[][]; columns: Record<string, number> };

// Every visible sheet with a header row (in its first 20 rows) holding all the
// wanted columns: the rows under it, and those columns' positions.
function findTables(buffer: ArrayBuffer, wanted: string[]): Table[] {
  const book = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const hidden = new Set((book.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name));
  const tables: Table[] = [];
  for (const sheetName of book.SheetNames) {
    if (hidden.has(sheetName)) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    const headerRow = grid.slice(0, 20).findIndex((r) => wanted.every((w) => r.some((c) => headerKey(c) === w)));
    if (headerRow < 0) continue;
    const keys = grid[headerRow].map(headerKey);
    const columns: Record<string, number> = {};
    for (const w of wanted) columns[w] = keys.indexOf(w);
    tables.push({ rows: grid.slice(headerRow + 1), columns });
  }
  return tables;
}

export async function readProductionPlan(file: File, t: Record<string, string>): Promise<ProductionPlanRow[]> {
  const tables = findTables(await file.arrayBuffer(), ["date", "shift", "pn"]);
  if (tables.length === 0) throw new Error(t.plan_err_production);
  const result: ProductionPlanRow[] = [];
  for (const { rows, columns } of tables) {
    for (const r of rows) {
      const date = toIsoDate(r[columns.date]);
      const sku = cellText(r[columns.pn]);
      if (!date || !sku) continue;
      for (const shift of toShifts(r[columns.shift])) result.push({ date, shift, sku });
    }
  }
  return result;
}

export async function readShippingPlan(file: File, t: Record<string, string>): Promise<ShippingPlanRow[]> {
  const [table] = findTables(await file.arrayBuffer(), ["nodoc", "nomorsku", "status"]);
  if (!table) throw new Error(t.plan_err_shipping);
  const { rows, columns } = table;
  const result: ShippingPlanRow[] = [];
  // No. Doc is merged across all the SKUs of a multi-SKU order, so only its
  // first row has a value.
  let docNo = "";
  for (const r of rows) {
    docNo = cellText(r[columns.nodoc]) || docNo;
    const sku = cellText(r[columns.nomorsku]);
    if (docNo && sku) result.push({ docNo, sku, status: cellText(r[columns.status]) });
  }
  return result;
}