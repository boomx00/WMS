import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, productCategories } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { checkCategoryUnits } from "@/lib/units";
import { cleanId, cleanName, cleanPositiveInt } from "@/lib/uom";

async function managerOnly() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can edit categories" }, { status: 403 });
  }
  return null;
}

async function countItems(categoryId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.categoryId, categoryId));
  return row.n;
}

// PATCH /api/product-categories/:id — Manager only.
// body: { name?, primaryUnitId?, secondaryUnitId?, defaultRatio?,
//         storageUnitId?, defaultStorageQty?, sortOrder? }
// The primary and secondary units can't change while the category has
// products: their stock and ratios are counted in those units. Move the
// products to another category first. The storage unit can change (it only
// names what the product's storage qty fills).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [category] = await db.select().from(productCategories).where(eq(productCategories.id, id));
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof productCategories.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const [clash] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(and(sql`lower(${productCategories.name}) = lower(${name})`, ne(productCategories.id, id)));
    if (clash) return NextResponse.json({ error: `There is already a category called "${name}"` }, { status: 409 });
    updates.name = name;
  }

  let primaryUnitId = category.primaryUnitId;
  let secondaryUnitId = category.secondaryUnitId;
  let storageUnitId = category.storageUnitId;
  if (body.primaryUnitId !== undefined) {
    const v = cleanId(body.primaryUnitId);
    if (!v) return NextResponse.json({ error: "Choose a primary unit" }, { status: 400 });
    primaryUnitId = v;
  }
  if (body.secondaryUnitId !== undefined) {
    const v = cleanId(body.secondaryUnitId);
    if (v === undefined) return NextResponse.json({ error: "Unknown unit" }, { status: 400 });
    secondaryUnitId = v;
  }
  if (body.storageUnitId !== undefined) {
    const v = cleanId(body.storageUnitId);
    if (v === undefined) return NextResponse.json({ error: "Unknown unit" }, { status: 400 });
    storageUnitId = v;
  }

  const countingUnitsChanged =
    primaryUnitId !== category.primaryUnitId || secondaryUnitId !== category.secondaryUnitId;
  const unitsChanged = countingUnitsChanged || storageUnitId !== category.storageUnitId;
  if (unitsChanged) {
    if (countingUnitsChanged) {
      const n = await countItems(id);
      if (n > 0) {
        return NextResponse.json(
          {
            error: `${category.name} has ${n.toLocaleString()} product(s), so its primary and secondary units can't change. Move them to another category first.`,
          },
          { status: 409 }
        );
      }
    }
    const unitError = await checkCategoryUnits(db, primaryUnitId, secondaryUnitId, storageUnitId);
    if (unitError) return NextResponse.json({ error: unitError }, { status: 400 });
    updates.primaryUnitId = primaryUnitId;
    updates.secondaryUnitId = secondaryUnitId;
    updates.storageUnitId = storageUnitId;
  }

  if (body.defaultRatio !== undefined) {
    const v = cleanPositiveInt(body.defaultRatio);
    if (v === undefined) return NextResponse.json({ error: "Default ratio must be a whole number above 0" }, { status: 400 });
    updates.defaultRatio = v;
  }
  if (body.defaultStorageQty !== undefined) {
    const v = cleanPositiveInt(body.defaultStorageQty);
    if (v === undefined) {
      return NextResponse.json({ error: "Default storage qty must be a whole number above 0" }, { status: 400 });
    }
    updates.defaultStorageQty = v;
  }
  // Defaults only mean something with their unit.
  if (secondaryUnitId === null) updates.defaultRatio = null;
  if (storageUnitId === null) updates.defaultStorageQty = null;

  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    updates.sortOrder = sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  const [updated] = await db.update(productCategories).set(updates).where(eq(productCategories.id, id)).returning();
  return NextResponse.json(updated);
}

// DELETE /api/product-categories/:id — Manager only. Not allowed while it
// has products.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [category] = await db.select().from(productCategories).where(eq(productCategories.id, id));
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const n = await countItems(id);
  if (n > 0) {
    return NextResponse.json(
      { error: `${category.name} has ${n.toLocaleString()} product(s), so it can't be deleted` },
      { status: 409 }
    );
  }
  await db.delete(productCategories).where(eq(productCategories.id, id));
  return NextResponse.json({ ok: true });
}
