import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { getSession, isSuperUser } from "@/lib/auth";
import { cleanAttribute, cleanSupplierId, cleanTags } from "@/lib/itemAttributes";
import { getCategory } from "@/lib/units";
import { cleanId, cleanPositiveInt } from "@/lib/uom";

export async function GET() {
  const rows = await db.select().from(items).orderBy(items.sku);
  return NextResponse.json(rows);
}

// POST /api/items — Manager only.
// body: { sku, name, categoryId, cartonBagQty?, palletCartonQty?, legacySku?,
//         cartonBarcode?, productType?, brand?, tags?, supplierId? }
// cartonBagQty    = secondary units per primary (e.g. packs per carton)
// palletCartonQty = primary units per storage unit (e.g. cartons per pallet)
// Either can be left out to take the category's default; both are 1 when
// the category has no such unit.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await isSuperUser(session.userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only Manager can create items" }, { status: 403 });
  }

  const body = await req.json();
  const { sku, name, legacySku, cartonBarcode, productType, brand, tags, supplierId } = body;

  if (!sku || !name) {
    return NextResponse.json({ error: "sku and name are required" }, { status: 400 });
  }

  const categoryId = cleanId(body.categoryId);
  if (!categoryId) {
    return NextResponse.json({ error: "Choose a category" }, { status: 400 });
  }
  const category = await getCategory(db, categoryId);
  if (!category) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const ratioInput = cleanPositiveInt(body.cartonBagQty ?? null);
  const storageInput = cleanPositiveInt(body.palletCartonQty ?? null);
  if (ratioInput === undefined || storageInput === undefined) {
    return NextResponse.json({ error: "Quantities must be whole numbers above 0" }, { status: 400 });
  }

  const cartonBagQty = category.secondaryUnitId === null ? 1 : ratioInput ?? category.defaultRatio;
  const palletCartonQty = category.storageUnitId === null ? storageInput ?? 1 : storageInput ?? category.defaultStorageQty;
  if (!cartonBagQty) {
    return NextResponse.json({ error: "Enter how many secondary units make one primary unit" }, { status: 400 });
  }
  if (!palletCartonQty) {
    return NextResponse.json({ error: "Enter how many primary units fill one storage unit" }, { status: 400 });
  }

  const [created] = await db
    .insert(items)
    .values({
      sku,
      name,
      categoryId,
      cartonBagQty,
      palletCartonQty,
      defaultCode: `${sku}*default`,
      legacySku: legacySku && legacySku.trim() ? legacySku.trim() : null,
      cartonBarcode: cartonBarcode && cartonBarcode.trim() ? cartonBarcode.trim() : null,
      productType: cleanAttribute(productType),
      brand: cleanAttribute(brand),
      tags: cleanTags(tags),
      supplierId: cleanSupplierId(supplierId) ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
