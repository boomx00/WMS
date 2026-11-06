import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveWarehouse } from "@/lib/warehouses";
import { cleanDate } from "@/lib/skuOpnameSummary";
import { isSkuOpname } from "@/lib/skuOpname";
import { getLocationSheetRows, type LocationSheetLine } from "@/lib/skuOpnameLocationSheet";

export const dynamic = "force-dynamic";

// POST /api/stock-opname/summary/locations
// body: { warehouseId, asOfDate: "YYYY-MM-DD", lines: [{ opnameNumber, itemId }] }
//
// The Location Detail sheet of the Stock Opname report's Excel export (see
// lib/skuOpnameLocationSheet.ts): lines = the SOSKU session of each SKU whose
// counts go on the sheet (the report's latest line per product); asOfDate =
// the report's last date, for the system stock of every other SKU. A POST only
// because lines can be too long for a URL: it changes nothing.
//
// Returns { rows: [{ location, systemSku, systemQty, soSku, soQty }] }.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const asOfDate = cleanDate(body.asOfDate);
  if (!asOfDate) {
    return NextResponse.json({ error: "asOfDate is required" }, { status: 400 });
  }
  const rawLines: unknown[] = Array.isArray(body.lines) ? body.lines : [];
  const lines: LocationSheetLine[] = [];
  for (const raw of rawLines) {
    const { opnameNumber, itemId } = (raw ?? {}) as { opnameNumber?: unknown; itemId?: unknown };
    if (typeof opnameNumber !== "string" || !isSkuOpname(opnameNumber) || !Number.isInteger(itemId)) {
      return NextResponse.json({ error: "Invalid lines" }, { status: 400 });
    }
    lines.push({ opnameNumber, itemId: itemId as number });
  }

  const resolved = await resolveWarehouse(db, body.warehouseId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // The end of that day in Asia/Jakarta, the zone the report's dates are in.
  const asOf = new Date(`${asOfDate}T23:59:59.999+07:00`);
  const rows = await getLocationSheetRows(db, { warehouseId: resolved.warehouse.id, asOf, lines });
  return NextResponse.json({ rows });
}
