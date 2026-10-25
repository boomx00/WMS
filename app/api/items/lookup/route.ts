import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq, or } from "drizzle-orm";

// GET /api/items/lookup?sku=WIDGET-123
// Resolves by current sku OR legacy sku, so old printed barcodes still work.
export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [item] = await db
    .select()
    .from(items)
    .where(or(eq(items.sku, sku), eq(items.legacySku, sku)));

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}