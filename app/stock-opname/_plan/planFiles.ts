import * as XLSX from "xlsx";
import { headerKey } from "../_summary/k3File";
import type { ProductionPlanRow, ShippingPlanRow } from "@/lib/stockOpnamePlan";

// Reading the production plan and shipping plan Excel files into rows.

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

// The rows under the first header row (in the first 20 rows of any sheet)
// holding every wanted column, with those columns' positions.
function findTable(
  buffer: ArrayBuffer,
  wanted: string[]
): { rows: unknown[][]; columns: Record<string, number> } | null {
  const book = XLSX.read(new Uint8Array(buffer), { type: "array" });
  for (const sheetName of book.SheetNames) {
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
    return { rows: grid.slice(headerRow + 1), columns };
  }
  return null;
}

export async function readProductionPlan(file: File, t: Record<string, string>): Promise<ProductionPlanRow[]> {
  const table = findTable(await file.arrayBuffer(), ["date", "shift", "pn"]);
  if (!table) throw new Error(t.plan_err_production);
  const { rows, columns } = table;
  const result: ProductionPlanRow[] = [];
  for (const r of rows) {
    const date = toIsoDate(r[columns.date]);
    const shift = cellText(r[columns.shift]).toUpperCase();
    const sku = cellText(r[columns.pn]);
    if (date && sku && (shift === "A" || shift === "B")) result.push({ date, shift, sku });
  }
  return result;
}

export async function readShippingPlan(file: File, t: Record<string, string>): Promise<ShippingPlanRow[]> {
  const table = findTable(await file.arrayBuffer(), ["nodoc", "nomorsku", "status"]);
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
