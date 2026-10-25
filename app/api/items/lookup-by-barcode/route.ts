import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq, or } from "drizzle-orm";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// Extracts just the SKU segment if a full pallet label was scanned
// (*SKU*seq*qty*WO) — a bare barcode or SKU has no "*" and passes through
// unchanged.
function extractSku(raw: string): string {
  const cleaned = raw.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || raw;
}

// GET /api/items/lookup-by-barcode?barcode=8990052000405
// Matches against carton barcode, current SKU, or legacy SKU. Also
// tolerates a full real pallet label being scanned by mistake — extracts
// just the SKU segment from it before matching.
export async function GET(req: NextRequest) {
  const raw = sanitize(req.nextUrl.searchParams.get("barcode") ?? "");

  if (!raw) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  const value = extractSku(raw);

  const [item] = await db
    .select()
    .from(items)
    .where(or(eq(items.cartonBarcode, value), eq(items.sku, value), eq(items.legacySku, value)));

  if (!item) {
    return NextResponse.json({ error: "Unknown barcode or SKU" }, { status: 404 });
  }

  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    palletCartonQty: item.palletCartonQty,
  });
}