import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { productCategories } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { checkCategoryUnits, getCategories } from "@/lib/units";
import { cleanId, cleanName, cleanPositiveInt } from "@/lib/uom";

export const dynamic = "force-dynamic";

// GET /api/product-categories — every product category, in display order:
// [{ id, name, primaryUnitId, secondaryUnitId, defaultRatio, storageUnitId,
//    defaultStorageQty, sortOrder, itemCount }]
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await getCategories(db));
}

// POST /api/product-categories — Manager only.
// body: { name, primaryUnitId, secondaryUnitId?, defaultRatio?, storageUnitId?, defaultStorageQty? }
// The default ratio only applies with a secondary unit, the default storage
// qty only with a storage unit.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can add categories" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const primaryUnitId = cleanId(body.primaryUnitId);
  if (!primaryUnitId) return NextResponse.json({ error: "Choose a primary unit" }, { status: 400 });
  const secondaryUnitId = cleanId(body.secondaryUnitId ?? null);
  const storageUnitId = cleanId(body.storageUnitId ?? null);
  const defaultRatio = cleanPositiveInt(body.defaultRatio ?? null);
  const defaultStorageQty = cleanPositiveInt(body.defaultStorageQty ?? null);
  if (secondaryUnitId === undefined || storageUnitId === undefined) {
    return NextResponse.json({ error: "Unknown unit" }, { status: 400 });
  }
  if (defaultRatio === undefined || defaultStorageQty === undefined) {
    return NextResponse.json({ error: "Defaults must be whole numbers above 0" }, { status: 400 });
  }

  const unitError = await checkCategoryUnits(db, primaryUnitId, secondaryUnitId, storageUnitId);
  if (unitError) return NextResponse.json({ error: unitError }, { status: 400 });

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${productCategories.sortOrder}), 0)::int + 1` })
    .from(productCategories);

  const [created] = await db
    .insert(productCategories)
    .values({
      name,
      primaryUnitId,
      secondaryUnitId,
      defaultRatio: secondaryUnitId ? defaultRatio : null,
      storageUnitId,
      defaultStorageQty: storageUnitId ? defaultStorageQty : null,
      sortOrder: next,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    return NextResponse.json({ error: `There is already a category called "${name}"` }, { status: 409 });
  }
  return NextResponse.json(created, { status: 201 });
}
