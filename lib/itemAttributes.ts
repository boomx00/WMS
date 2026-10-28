import { items } from "@/db/schema";
import { sql, type SQL } from "drizzle-orm";

// A product's Type / Brand / Tags (items.product_type, brand, tags).
// Type and Brand are one value each ("Diapers", "MAKUKU"); tags are any
// number of short labels such as sizes and pack combos ("XL", "34+6").

export { cleanAttribute, cleanTags, cleanSupplierId, sortTags } from "@/lib/itemTags";
import { sortTags } from "@/lib/itemTags";
import { getSuppliers, type SupplierOption } from "@/lib/suppliers";

// The item has this tag (exact, ignoring case — "L" doesn't match "XL").
export function itemHasTag(tag: string): SQL {
  return sql`exists (select 1 from unnest(${items.tags}) as t(tag) where lower(t.tag) = lower(${tag}))`;
}

// Same value ignoring case and surrounding spaces.
export function sameText(column: SQL | typeof items.productType | typeof items.brand, value: string): SQL {
  return sql`lower(trim(${column})) = lower(${value.trim()})`;
}

// Every Type, Brand and Tag in use, and every supplier, for the pickers:
// { types, brands, tags, suppliers: [{ id, name, kind }] }.
export async function getItemAttributeOptions(
  db: any
): Promise<{ types: string[]; brands: string[]; tags: string[]; suppliers: SupplierOption[] }> {
  const [types, brands, tags, suppliers] = await Promise.all([
    db.execute(sql`select distinct product_type as v from items where coalesce(trim(product_type), '') <> '' order by 1`),
    db.execute(sql`select distinct brand as v from items where coalesce(trim(brand), '') <> '' order by 1`),
    db.execute(sql`select distinct t as v from items, unnest(tags) as t where trim(t) <> '' order by 1`),
    getSuppliers(db),
  ]);
  const values = (r: any) => (Array.isArray(r) ? r : r.rows ?? []).map((row: { v: string }) => row.v);
  return { types: values(types), brands: values(brands), tags: sortTags(values(tags)), suppliers };
}
