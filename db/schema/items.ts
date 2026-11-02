import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { pallets } from "./pallets";

// Products (items), suppliers, and per-item ledger anchors.

// Where products come from: PRODUCTION (made in-house — production inbound
// from the PDA is recorded against it) or EXTERNAL (bought from outside).
export const supplierKindEnum = pgEnum("supplier_kind", ["PRODUCTION", "EXTERNAL"]);

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: supplierKindEnum("kind").notNull().default("EXTERNAL"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("suppliers_name_idx").on(sql`lower(${table.name})`)]
);

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull(),
    legacySku: text("legacy_sku"),
    cartonBarcode: text("carton_barcode"), // physical carton barcode — not unique, variants can share one
    name: text("name").notNull(),
    defaultCode: text("default_code").notNull(),
    cartonBagQty: integer("carton_bag_qty").notNull(),
    palletCartonQty: integer("pallet_carton_qty").notNull(),
    // Product classification, for searching (Items page, Movement History):
    // type e.g. "Diapers", brand e.g. "MAKUKU", tags e.g. ["XL", "34+6"].
    productType: text("product_type"),
    brand: text("brand"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // The product's supplier (Production or an outside one), if set.
    supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("items_sku_idx").on(table.sku),
    uniqueIndex("items_legacy_sku_idx").on(table.legacySku),
  ]
);

export const itemsRelations = relations(items, ({ many }) => ({
  pallets: many(pallets),
}));

export const itemLedgerAnchors = pgTable(
  "item_ledger_anchors",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    openingQuantity: integer("opening_quantity").notNull(),
    openingAt: timestamp("opening_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("item_ledger_anchors_item_idx").on(table.itemId)]
);
