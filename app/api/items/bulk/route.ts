import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { cleanAttribute, cleanSupplierId, cleanTags } from "@/lib/itemAttributes";

const MAX_ITEMS = 5000;

// PATCH /api/items/bulk — Manager only.
// body: { ids: number[], productType?, brand?, supplierId?, addTags?, removeTags? }
// Sets Type / Brand / Supplier on many products at once ("" clears; leave a field out
// to keep each product's own value), and adds / removes tags without
// touching their other tags. Returns { updated }.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can edit items" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = [
    ...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0)),
  ] as number[];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Choose at least one product" }, { status: 400 });
  }
  if (ids.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Too many products (max ${MAX_ITEMS})` }, { status: 400 });
  }

  const setType = body.productType !== undefined;
  const setBrand = body.brand !== undefined;
  const setSupplier = body.supplierId !== undefined;
  const addTags = cleanTags(body.addTags);
  const removeTags = new Set(cleanTags(body.removeTags).map((t) => t.toLowerCase()));
  if (!setType && !setBrand && !setSupplier && addTags.length === 0 && removeTags.size === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  // Only Type / Brand: one update for all of them.
  if (addTags.length === 0 && removeTags.size === 0) {
    const updates: Record<string, unknown> = {};
    if (setType) updates.productType = cleanAttribute(body.productType);
    if (setBrand) updates.brand = cleanAttribute(body.brand);
    if (setSupplier) updates.supplierId = cleanSupplierId(body.supplierId);
    const updated = await db.update(items).set(updates).where(inArray(items.id, ids)).returning({ id: items.id });
    return NextResponse.json({ updated: updated.length });
  }

  const rows = await db.select({ id: items.id, tags: items.tags }).from(items).where(inArray(items.id, ids));

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const updates: Record<string, unknown> = {};
      if (setType) updates.productType = cleanAttribute(body.productType);
      if (setBrand) updates.brand = cleanAttribute(body.brand);
      if (setSupplier) updates.supplierId = cleanSupplierId(body.supplierId);
      if (addTags.length > 0 || removeTags.size > 0) {
        updates.tags = cleanTags([...row.tags, ...addTags]).filter((t) => !removeTags.has(t.toLowerCase()));
      }
      await tx.update(items).set(updates).where(inArray(items.id, [row.id]));
    }
  });

  return NextResponse.json({ updated: rows.length });
}
