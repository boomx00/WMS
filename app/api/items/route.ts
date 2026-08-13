import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";

// GET /api/items - list all items
export async function GET() {
  const rows = await db.select().from(items);
  return NextResponse.json(rows);
}

// POST /api/items - create an item
// body: { sku, name, cartonBagQty, palletCartonQty }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sku, name, cartonBagQty, palletCartonQty, legacySku } = body;

  if (!sku || !name || cartonBagQty === undefined || palletCartonQty === undefined) {
    return NextResponse.json(
      { error: "sku, name, cartonBagQty, and palletCartonQty are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(items)
    .values({
      sku,
      name,
      cartonBagQty,
      palletCartonQty,
      defaultCode: `${sku}*default`,
      legacySku: legacySku && legacySku.trim() ? legacySku.trim() : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}