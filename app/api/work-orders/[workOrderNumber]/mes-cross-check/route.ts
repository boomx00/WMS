import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMesTagTransitRecords } from "@/lib/mes";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";

// Adds a MATCH_KEY to every MES record, leaving LABEL_NO exactly as printed.
//
// WMS stores a scanned pallet under the item's CURRENT sku (normalizeLabel),
// while MES keeps the label as printed — which may still carry a legacy code,
// e.g. printed *5020004006*0024*5000*MO008213 is stored in WMS as
// *14013074701*0024*5000*MO008213. MATCH_KEY is the label rewritten to the
// current sku so the client can line the two up, while still DISPLAYING the
// printed LABEL_NO.
//
// The rewrite only happens when the items table actually records that code
// as the legacy_sku of an item (i.e. 5020004006 really is the legacy of
// 14013074701). Any other code is left as-is, so a wrong or unknown code
// simply won't match instead of being silently mapped to some item.
// One batched lookup for all labels, not one query per label.
async function addMatchKeys<T extends { LABEL_NO: string }>(
  records: T[]
): Promise<(T & { MATCH_KEY: string; CURRENT_SKU: string | null })[]> {
  const skuOf = (label: string) => {
    const parts = label.replace(/^\*+/, "").split("*");
    return parts.length === 4 ? parts[0] : null;
  };

  const scannedSkus = Array.from(
    new Set(records.map((r) => skuOf(r.LABEL_NO ?? "")).filter((s): s is string => !!s))
  );

  const legacyToCurrent = new Map<string, string>();
  if (scannedSkus.length > 0) {
    const rows = await db
      .select({ sku: items.sku, legacySku: items.legacySku })
      .from(items)
      .where(inArray(items.legacySku, scannedSkus));
    for (const row of rows) {
      if (row.legacySku && row.legacySku !== row.sku) legacyToCurrent.set(row.legacySku, row.sku);
    }
  }

  return records.map((r) => {
    const raw = r.LABEL_NO ?? "";
    const sku = skuOf(raw);
    const current = sku ? legacyToCurrent.get(sku) ?? null : null;
    if (!sku || !current) return { ...r, MATCH_KEY: raw, CURRENT_SKU: null };

    const rest = raw.replace(/^\*+/, "").split("*").slice(1);
    return { ...r, MATCH_KEY: [current, ...rest].join("*"), CURRENT_SKU: current };
  });
}

// GET /api/work-orders/{workOrderNumber}/mes-cross-check
// Read-only: fetches MES's Tag Transit Records for this MO/work order number
// so the client can line them up against the WMS pallets already loaded for
// this work order. Nothing is written on either side.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workOrderNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { workOrderNumber } = await params;
  if (!workOrderNumber) {
    return NextResponse.json({ error: "Work order number is required" }, { status: 400 });
  }

  try {
    const rawRecords = await getMesTagTransitRecords(workOrderNumber);
    const records = await addMatchKeys(rawRecords ?? []);
    return NextResponse.json({ records });
  } catch (err) {
    console.error("MES cross-check failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach MES" },
      { status: 502 }
    );
  }
}