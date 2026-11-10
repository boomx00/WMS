// Server-only: units of measure and product categories (Items page → Units /
// Categories). Pure conversion helpers are in lib/uom.ts.

import { items, locationStock, productCategories, units } from "@/db/schema";
import { asc, eq, inArray, or, sql } from "drizzle-orm";
import type { CategoryInfo, UnitInfo } from "@/lib/uom";

export type UnitListRow = UnitInfo & { categoryCount: number };
export type CategoryListRow = CategoryInfo & { itemCount: number };

// Every unit in display order, with how many categories use it.
export async function getUnits(db: any): Promise<UnitListRow[]> {
  return db
    .select({
      id: units.id,
      code: units.code,
      name: units.name,
      nameId: units.nameId,
      nameZh: units.nameZh,
      decimals: units.decimals,
      sortOrder: units.sortOrder,
      // The outer table is written out in full: Drizzle renders ${units.id}
      // as a bare "id" here, which the subquery would read as c.id.
      categoryCount: sql<number>`(
        select count(*)::int from ${productCategories} c
         where c.primary_unit_id = "units"."id"
            or c.secondary_unit_id = "units"."id"
            or c.storage_unit_id = "units"."id"
      )`,
    })
    .from(units)
    .orderBy(asc(units.sortOrder), asc(units.code));
}

// Every category in display order, with how many products are in it.
export async function getCategories(db: any): Promise<CategoryListRow[]> {
  return db
    .select({
      id: productCategories.id,
      name: productCategories.name,
      primaryUnitId: productCategories.primaryUnitId,
      secondaryUnitId: productCategories.secondaryUnitId,
      defaultRatio: productCategories.defaultRatio,
      storageUnitId: productCategories.storageUnitId,
      defaultStorageQty: productCategories.defaultStorageQty,
      sortOrder: productCategories.sortOrder,
      itemCount: sql<number>`(select count(*)::int from ${items} i where i.category_id = "product_categories"."id")`,
    })
    .from(productCategories)
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
}

export async function getCategory(db: any, id: number): Promise<CategoryInfo | null> {
  const [row] = await db.select().from(productCategories).where(eq(productCategories.id, id));
  return row ?? null;
}

// How many categories use the unit (as primary, secondary or storage).
export async function countCategoriesUsingUnit(db: any, unitId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productCategories)
    .where(
      or(
        eq(productCategories.primaryUnitId, unitId),
        eq(productCategories.secondaryUnitId, unitId),
        eq(productCategories.storageUnitId, unitId)
      )
    );
  return row.n;
}

// Moving products to another category. Allowed when the new category counts
// in the same primary and secondary units, or the product holds no stock
// (its stock is counted in its old category's units). Returns an error
// message or null.
export async function checkCategoryMove(db: any, itemIds: number[], categoryId: number): Promise<string | null> {
  const target = await getCategory(db, categoryId);
  if (!target) return "Unknown category";
  if (itemIds.length === 0) return null;

  const result = await db.execute(sql`
    select i.sku
      from ${items} i
      join ${productCategories} c on c.id = i.category_id
     where i.id in (${sql.join(itemIds.map((id) => sql`${id}`), sql`, `)})
       and (c.primary_unit_id <> ${target.primaryUnitId}
            or c.secondary_unit_id is distinct from ${target.secondaryUnitId})
       and exists (select 1 from ${locationStock} ls
                    where ls.item_id = i.id and (ls.quantity <> 0 or ls.loose_packs <> 0))
     order by i.sku
     limit 6
  `);
  const rows: { sku: string }[] = Array.isArray(result) ? result : result.rows ?? [];
  if (rows.length === 0) return null;
  const list = rows.slice(0, 5).map((r) => r.sku).join(", ") + (rows.length > 5 ? ", …" : "");
  return `${target.name} uses different units, and these products hold stock counted in their current units: ${list}`;
}

// The ids are real units, all different. Returns an error message or null.
export async function checkCategoryUnits(
  db: any,
  primaryUnitId: number,
  secondaryUnitId: number | null,
  storageUnitId: number | null
): Promise<string | null> {
  const ids = [primaryUnitId, secondaryUnitId, storageUnitId].filter((v): v is number => v !== null);
  if (new Set(ids).size !== ids.length) return "Primary, secondary and storage units must all be different";
  const found = await db.select({ id: units.id }).from(units).where(inArray(units.id, ids));
  if (found.length !== ids.length) return "Unknown unit";
  return null;
}
