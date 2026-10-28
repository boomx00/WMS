import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { cleanAttribute, cleanSupplierId, cleanTags } from "@/lib/itemAttributes";

// PATCH /api/items/:id — Manager only. Any subset of fields can be updated.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await isSuperUser(session.userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only Manager can edit items" }, { status: 403 });
  }

  const { id } = await params;
  const itemId = Number(id);

  const body = await req.json();
  const { sku, name, cartonBagQty, palletCartonQty, legacySku, cartonBarcode, productType, brand, tags, supplierId } = body;

  const updates: Record<string, unknown> = {};
  if (sku !== undefined) updates.sku = sku;
  if (name !== undefined) updates.name = name;
  if (cartonBagQty !== undefined) updates.cartonBagQty = cartonBagQty;
  if (palletCartonQty !== undefined) updates.palletCartonQty = palletCartonQty;
  if (legacySku !== undefined) updates.legacySku = legacySku && legacySku.trim() ? legacySku.trim() : null;
  if (cartonBarcode !== undefined)
    updates.cartonBarcode = cartonBarcode && cartonBarcode.trim() ? cartonBarcode.trim() : null;
  // Type / Brand: "" clears; tags: an array or "XL, 34+6" (replaces them all).
  if (productType !== undefined) updates.productType = cleanAttribute(productType);
  if (brand !== undefined) updates.brand = cleanAttribute(brand);
  if (tags !== undefined) updates.tags = cleanTags(tags);
  if (supplierId !== undefined) updates.supplierId = cleanSupplierId(supplierId);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields provided to update" }, { status: 400 });
  }

  const [updated] = await db.update(items).set(updates).where(eq(items.id, itemId)).returning();

  if (!updated) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}