import { pgTable, serial, text, integer, timestamp, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Units of measure and product categories (Items page → Units / Categories).
//
// Units are data, not code: each client names their own ("Carton", "Pack",
// "Kilogram", "Box", "Pallet"). A product category says which units its
// products are counted and stored in:
//   primary   — the main unit, e.g. Carton (Kilogram for a weighed material)
//   secondary — optional smaller unit, e.g. Pack. How many secondary units
//               make one primary is set per product (items.carton_bag_qty),
//               since it differs per SKU (4, 6, 8 or 32 packs per carton).
//   storage   — optional unit of storage, e.g. Pallet. How many primary
//               units fill one is set per product (items.pallet_carton_qty).
// The category's default ratio / storage qty pre-fill new products.

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // short label, e.g. "CTN", "PK", "KG"
    name: text("name").notNull(), // e.g. "Carton"
    nameId: text("name_id"), // Indonesian name (null = use name)
    nameZh: text("name_zh"), // Chinese name (null = use name)
    // Decimal places a quantity in this unit can have: 0 for Carton / Pack,
    // e.g. 3 for Kilogram (stock is kept as whole numbers of the smallest
    // step, so 12.5 kg is stored as 12500).
    decimals: integer("decimals").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("units_code_idx").on(sql`lower(${table.code})`),
    check("units_decimals_range", sql`${table.decimals} BETWEEN 0 AND 6`),
  ]
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // e.g. "Diapers"
    primaryUnitId: integer("primary_unit_id")
      .notNull()
      .references((): AnyPgColumn => units.id, { onDelete: "restrict" }),
    secondaryUnitId: integer("secondary_unit_id").references((): AnyPgColumn => units.id, { onDelete: "restrict" }),
    // Secondary units per 1 primary, pre-filled on new products.
    defaultRatio: integer("default_ratio"),
    storageUnitId: integer("storage_unit_id").references((): AnyPgColumn => units.id, { onDelete: "restrict" }),
    // Primary units per 1 storage unit, pre-filled on new products.
    defaultStorageQty: integer("default_storage_qty"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("product_categories_name_idx").on(sql`lower(${table.name})`),
    check(
      "product_categories_units_differ",
      sql`${table.secondaryUnitId} IS DISTINCT FROM ${table.primaryUnitId}
        AND ${table.storageUnitId} IS DISTINCT FROM ${table.primaryUnitId}
        AND (${table.storageUnitId} IS NULL OR ${table.storageUnitId} IS DISTINCT FROM ${table.secondaryUnitId})`
    ),
    check("product_categories_default_ratio_positive", sql`${table.defaultRatio} IS NULL OR ${table.defaultRatio} > 0`),
    check(
      "product_categories_default_storage_qty_positive",
      sql`${table.defaultStorageQty} IS NULL OR ${table.defaultStorageQty} > 0`
    ),
  ]
);

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
  primaryUnit: one(units, { fields: [productCategories.primaryUnitId], references: [units.id] }),
  secondaryUnit: one(units, { fields: [productCategories.secondaryUnitId], references: [units.id] }),
  storageUnit: one(units, { fields: [productCategories.storageUnitId], references: [units.id] }),
}));
