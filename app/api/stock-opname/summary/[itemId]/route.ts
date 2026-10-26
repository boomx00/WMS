import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { resolveWarehouse } from "@/lib/warehouses";
import { getSkuOpnameEntries, getSummaryBuckets } from "@/lib/skuOpnameSummary";

export const dynamic = "force-dynamic";

// GET /api/stock-opname/summary/:itemId?warehouseId=N
// Detail for one product on the Stock Opname Summary tab: EVERY per-SKU
// opname it has had (not only the latest per day, and not limited by the
// tab's date filter), oldest first, with the counted lines behind each.
//   { item: { itemId, sku, name }, buckets, entries: [...SummaryEntry with lines] }
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { itemId: raw } = await params;
  const itemId = Number(raw);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }
  const [item] = await db.select({ itemId: items.id, sku: items.sku, name: items.name }).from(items).where(eq(items.id, itemId));
  if (!item) {
    return NextResponse.json({ error: "Unknown item" }, { status: 404 });
  }

  const resolved = await resolveWarehouse(db, req.nextUrl.searchParams.get("warehouseId"));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const [entries, buckets] = await Promise.all([
    getSkuOpnameEntries(db, { warehouseId: resolved.warehouse.id, itemId, withLines: true }),
    getSummaryBuckets(db, resolved.warehouse.id),
  ]);

  return NextResponse.json({ item, buckets, entries });
}
