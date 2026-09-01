import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, locationStock } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";

// Expected columns (header text, whitespace/case-insensitive):
//   LOC | Kode Material | SKU AWAL | PALET | BOX/PALET | TOTAL BOX
//
// Matching rule: LOC -> locations.code, Kode Material -> items.sku.
// SKU AWAL is informational only, never used for matching.
// TOTAL BOX (from the file) is compared against the live location_stock
// quantity for that location+item. Read-only report — nothing is written.

function normalizeHeader(h: string): string {
  return h.toString().trim().toUpperCase().replace(/\s+/g, "");
}

const HEADER_MAP: Record<string, string> = {
  LOC: "loc",
  KODEMATERIAL: "kodeMaterial",
  SKUAWAL: "skuAwal",
  PALET: "palet",
  "BOX/PALET": "boxPerPalet",
  TOTALBOX: "totalBox",
};

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

type ReportRow = {
  rowNumber: number;
  loc: string;
  kodeMaterial: string;
  skuAwal: string;
  palet: number | null;
  boxPerPalet: number | null;
  totalBox: number | null;
  systemQty: number | null;
  difference: number | null;
  status: "MATCH" | "MISMATCH" | "UNKNOWN_LOCATION" | "UNKNOWN_SKU" | "INVALID_ROW";
};

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  let rawRows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ error: "The file has no sheets" }, { status: 400 });
    }
    const sheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Couldn't read this file — is it a valid .xlsx/.xls?" }, { status: 400 });
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "The file has no data rows" }, { status: 400 });
  }

  // Normalize each row's headers to our internal keys.
  const normalizedRows = rawRows.map((raw) => {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const mapped = HEADER_MAP[normalizeHeader(key)];
      if (mapped) row[mapped] = value;
    }
    return row;
  });

  const missingHeaders = ["loc", "kodeMaterial", "totalBox"].filter(
    (required) => !normalizedRows.some((r) => r[required] !== undefined)
  );
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        error: `Couldn't find expected column(s) in the file: ${missingHeaders
          .map((k) => (k === "loc" ? "LOC" : k === "kodeMaterial" ? "Kode Material" : "TOTAL BOX"))
          .join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Preload all locations and items once instead of querying per row.
  const allLocations = await db.select().from(locations);
  const locationByCode = new Map(allLocations.map((l) => [l.code.trim().toUpperCase(), l]));

  const allItems = await db.select().from(items);
  const itemBySku = new Map(allItems.map((i) => [i.sku.trim().toUpperCase(), i]));

  const stockRows = await db.select().from(locationStock);
  const stockByLocationAndItem = new Map(stockRows.map((s) => [`${s.locationId}:${s.itemId}`, s.quantity]));

  const report: ReportRow[] = normalizedRows.map((row, idx) => {
    const loc = String(row.loc ?? "").trim();
    const kodeMaterial = String(row.kodeMaterial ?? "").trim();
    const skuAwal = String(row.skuAwal ?? "").trim();
    const palet = toNumber(row.palet);
    const boxPerPalet = toNumber(row.boxPerPalet);
    const totalBox = toNumber(row.totalBox);

    const base = { rowNumber: idx + 2, loc, kodeMaterial, skuAwal, palet, boxPerPalet, totalBox };

    if (!loc || !kodeMaterial || totalBox === null) {
      return { ...base, systemQty: null, difference: null, status: "INVALID_ROW" as const };
    }

    const location = locationByCode.get(loc.toUpperCase());
    if (!location) {
      return { ...base, systemQty: null, difference: null, status: "UNKNOWN_LOCATION" as const };
    }

    const item = itemBySku.get(kodeMaterial.toUpperCase());
    if (!item) {
      return { ...base, systemQty: null, difference: null, status: "UNKNOWN_SKU" as const };
    }

    const systemQty = stockByLocationAndItem.get(`${location.id}:${item.id}`) ?? 0;
    const difference = totalBox - systemQty;

    return {
      ...base,
      systemQty,
      difference,
      status: difference === 0 ? ("MATCH" as const) : ("MISMATCH" as const),
    };
  });

  const summary = {
    totalRows: report.length,
    matches: report.filter((r) => r.status === "MATCH").length,
    mismatches: report.filter((r) => r.status === "MISMATCH").length,
    unknownLocations: report.filter((r) => r.status === "UNKNOWN_LOCATION").length,
    unknownSkus: report.filter((r) => r.status === "UNKNOWN_SKU").length,
    invalidRows: report.filter((r) => r.status === "INVALID_ROW").length,
  };

  return NextResponse.json({ summary, report });
}