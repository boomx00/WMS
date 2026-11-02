// Reading the daily outbound schedule workbook into sales order documents,
// for Sales Orders → Import from Excel (POST /api/sales-orders/import).
//
// The template:
//   Row 1        the date, e.g. "Senin, 02 November 2026" — every document
//                in the file gets this as its order date
//   Header row   No | No. Doc | (SKU) | Material Name | Qty Ctn | ... | Status
//   Data rows    one row per product line. A document with several lines
//                has its No. Doc merged down (or left blank) on the rows
//                under it, so a blank No. Doc means "same document as the
//                row above".
//
// Columns are found by their header text (case, spaces and punctuation
// ignored), not by letter, so an inserted or moved column doesn't break the
// import. Pure — no database access — so it can be tested on its own.

// "No. Doc" -> "nodoc", "Qty Ctn" -> "qtyctn"
export const headerKey = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADERS = {
  docNumber: ["nodoc", "nodokumen", "nodocument", "docno", "documentno", "documentnumber", "sonumber", "noso"],
  sku: ["sku", "kodematerial", "materialcode", "kodebarang", "itemcode"],
  name: ["materialname", "namamaterial", "productname", "namaproduk", "namabarang", "itemname"],
  quantity: ["qtyctn", "qty", "quantity", "qtycarton", "qtycartons", "jumlah", "jumlahctn"],
  status: ["status"],
} as const;

type ColumnKey = keyof typeof HEADERS;
export type ImportColumns = Partial<Record<ColumnKey, number>>;

// Status text that means the document is already finished — these are left
// out of the import.
const DONE_STATUSES = new Set(["done", "selesai"]);

// Non-breaking and zero-width spaces sneak in from copied paperwork.
const INVISIBLE = /[ ​‌‍﻿]/g;

export function cleanCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
}

// For comparing document numbers: "SO-202610000784", "so 202610000784" and
// "SO202610000784" are the same document.
export function docKey(docNumber: string): string {
  return docNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// For matching a Material Name to items.name: no case, no spaces at all
// (so "Pants M80+10" and "Pants M 80 + 10" match).
export function productNameKey(name: string): string {
  return name.replace(INVISIBLE, "").toLowerCase().replace(/\s+/g, "");
}

export function isDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status.trim().toLowerCase());
}

// ── Date (row 1) ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2, pebruari: 2,
  maret: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, agu: 8, agt: 8, aug: 8, ags: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nopember: 11, nov: 11, nop: 11,
  desember: 12, december: 12, des: 12, dec: 12,
};

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 February
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// A cell's date as "YYYY-MM-DD", or null. Handles a real Excel date (serial
// number), "Senin, 02 November 2026" / "2 Nov 2026" (Indonesian or English
// month names), "2026-11-02" and "02/11/2026" (day first).
export function parseDateCell(v: unknown): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    // Excel serial date (days since 1899-12-30).
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return isoDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  const s = cleanCell(v).toLowerCase();
  if (!s) return null;

  let m = s.match(/(\d{1,2})\s*[-\s]\s*([a-z]+)\.?\s*[-\s]\s*(\d{4})/);
  if (m && MONTHS[m[2]]) return isoDate(Number(m[3]), MONTHS[m[2]], Number(m[1]));

  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));

  return null;
}

// ── Quantity ────────────────────────────────────────────────────────────────

// A whole, positive carton count, or null. "1.000" / "1,000" = 1000.
export function parseQuantity(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const s = cleanCell(v).replace(/\s/g, "");
    if (!s) return null;
    n = /^\d{1,3}([.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, "")) : Number(s.replace(",", "."));
  }
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Sheet ───────────────────────────────────────────────────────────────────

export type ParsedLine = {
  row: number; // spreadsheet row number, as Excel shows it
  sku: string;
  name: string;
  rawQuantity: string;
  quantity: number | null;
  status: string;
};

export type ParsedDoc = {
  docNumber: string;
  row: number; // row the document number is on
  lines: ParsedLine[];
  done: boolean; // any line's Status is Done
};

export type ParsedSheet = {
  orderDate: string | null; // "YYYY-MM-DD"
  dateText: string; // the date cell as written, for showing back
  columns: ImportColumns;
  docs: ParsedDoc[];
  orphanRows: number[]; // product rows with no document number above them
};

// rows: the sheet as an array of rows (XLSX sheet_to_json header:1).
// firstRowNumber: the spreadsheet row number of rows[0] (usually 1).
export function parseSalesOrderSheet(
  rows: unknown[][],
  firstRowNumber = 1
): ParsedSheet | { error: string } {
  // Header row: the first of the top rows that has a document number column.
  let headerIndex = -1;
  const columns: ImportColumns = {};
  for (let i = 0; i < Math.min(rows.length, 15) && headerIndex < 0; i++) {
    const keys = (rows[i] ?? []).map(headerKey);
    if (!keys.some((k) => (HEADERS.docNumber as readonly string[]).includes(k))) continue;
    headerIndex = i;
    keys.forEach((k, col) => {
      for (const [field, names] of Object.entries(HEADERS) as [ColumnKey, readonly string[]][]) {
        if (columns[field] === undefined && names.includes(k)) columns[field] = col;
      }
    });
  }
  if (headerIndex < 0) {
    return { error: 'Couldn\'t find the header row — expected a "No. Doc" column in the first rows.' };
  }
  const missing: string[] = [];
  if (columns.sku === undefined && columns.name === undefined) missing.push("Material Name (or SKU)");
  if (columns.quantity === undefined) missing.push("Qty Ctn");
  if (missing.length > 0) {
    return { error: `Couldn't find column(s): ${missing.join(", ")}` };
  }

  // Date: the first date-looking cell above the header row (row 1).
  let orderDate: string | null = null;
  let dateText = "";
  for (let i = 0; i < headerIndex && !orderDate; i++) {
    for (const cell of rows[i] ?? []) {
      const parsed = parseDateCell(cell);
      if (parsed) {
        orderDate = parsed;
        dateText = cleanCell(cell);
        break;
      }
    }
  }

  const get = (row: unknown[], field: ColumnKey) => {
    const col = columns[field];
    return col === undefined ? "" : row[col];
  };

  const docs: ParsedDoc[] = [];
  const orphanRows: number[] = [];
  let current: ParsedDoc | null = null;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = firstRowNumber + i;
    const docNumber = cleanCell(get(row, "docNumber"));
    const sku = cleanCell(get(row, "sku"));
    const name = cleanCell(get(row, "name"));
    const rawQty = get(row, "quantity");
    const rawQuantity = cleanCell(rawQty);
    const status = cleanCell(get(row, "status"));

    // A new document starts where a different number appears. The same
    // number repeated on the next row (instead of merged) is the same doc.
    if (docNumber && (!current || docKey(docNumber) !== docKey(current.docNumber))) {
      current = { docNumber, row: rowNumber, lines: [], done: false };
      docs.push(current);
    }

    if (!sku && !name && !rawQuantity) {
      if (current && isDoneStatus(status)) current.done = true;
      continue; // blank row (or just a merged-cell leftover)
    }
    if (!current) {
      orphanRows.push(rowNumber);
      continue;
    }
    current.lines.push({ row: rowNumber, sku, name, rawQuantity, quantity: parseQuantity(rawQty), status });
    if (isDoneStatus(status)) current.done = true;
  }

  return { orderDate, dateText, columns, docs, orphanRows };
}

// ── Results (shared with the client) ────────────────────────────────────────

export type ImportFailReason =
  | "STATUS_DONE"
  | "ALREADY_EXISTS"
  | "DUPLICATE_IN_FILE"
  | "UNKNOWN_TYPE"
  | "UNKNOWN_PRODUCT"
  | "AMBIGUOUS_PRODUCT"
  | "BAD_QTY"
  | "NO_LINES"
  | "NO_DOC_NUMBER"
  | "ERROR";

export type ImportDocResult = {
  row: number;
  docNumber: string; // as written in the file
  soNumber: string; // as it is / would be saved
  typeName: string | null;
  lines: { sku: string; name: string; quantity: number }[];
  totalQty: number;
  ok: boolean;
  reason: ImportFailReason | null;
  // Extra detail for the reason, e.g. the product name and row it failed on.
  detail: string | null;
};

export type ImportResponse = {
  committed: boolean; // false = preview only, nothing saved
  orderDate: string;
  dateText: string;
  results: ImportDocResult[];
};
