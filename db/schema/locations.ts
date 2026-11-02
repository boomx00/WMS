import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  boolean,
  unique,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { pallets, palletEvents } from "./pallets";

// Warehouses, Total Stock columns, location types and locations (Locations page).

// Parent locations, e.g. "Finished Goods", "Raw Material" — managed on the
// Locations page (Warehouses tab). Every location belongs to one; Total
// Stock has a tab per warehouse with its own columns. The PDA works in one
// warehouse at a time (chosen after login) and its location pickers start
// on that warehouse's defaults (Settings → Locations & Marking).
export const warehouses = pgTable(
  "warehouses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Inactive: not offered on the PDA and can't get new locations; its
    // existing locations and stock stay and still show on the web.
    isActive: boolean("is_active").notNull().default(true),
    // Must be a receiving / staging location in this warehouse.
    defaultReceivingLocationId: integer("default_receiving_location_id").references((): AnyPgColumn => locations.id, {
      onDelete: "set null",
    }),
    defaultStagingLocationId: integer("default_staging_location_id").references((): AnyPgColumn => locations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("warehouses_name_unique").on(table.name)]
);

// The columns of one warehouse's Total Stock tab (and the sections of its
// per-SKU ledger), managed on Settings → Total Stock Columns. Each location
// picks one of its warehouse's columns as "Shown under", or none (counted
// in the total only).
export const stockColumns = pgTable(
  "stock_columns",
  {
    id: serial("id").primaryKey(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references((): AnyPgColumn => warehouses.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Good Stock"
        nameId: text("name_id"),
    nameZh: text("name_zh"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("stock_columns_warehouse_name_unique").on(table.warehouseId, table.name)]
);

// Location types are data, not code: each client defines their own, and
// the app reads these rules instead of checking type names.
export const locationTypes = pgTable(
  "location_types",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // stable key stored in locations.type, e.g. "RACK"
    name: text("name").notNull(), // display name, e.g. "Rack"

    // false = only 1 SKU per location (today: RACK), true = mixed SKUs.
    allowsMultipleSku: boolean("allows_multiple_sku").notNull().default(true),
    // Locations of this type have Area / X / Y and appear on the warehouse map.
    hasPosition: boolean("has_position").notNull().default(false),
    // Can be picked from. Pickable + multiple SKU also allows Default Picking.
    pickable: boolean("pickable").notNull().default(false),
    // Max pallets' worth of stock per location; null = no limit.
    maxPallets: integer("max_pallets"),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("location_types_code_unique").on(table.code)]
);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // e.g. "A1.1", "FLOOR", "DESTROY", "LEFTOVER"
    type: text("type")
      .notNull()
      .references(() => locationTypes.code, { onUpdate: "cascade", onDelete: "restrict" }),
    // The parent location (warehouse) this location belongs to.
    warehouseId: integer("warehouse_id")
      .notNull()
      .references((): AnyPgColumn => warehouses.id, { onDelete: "restrict" }),
    // What the location is used for. Any number of locations can have each;
    // the PDA picks one (default on Settings → General).
    //   isReceiving = inbound lands here; Move Floor → Rack takes from here
    //   isStaging   = picks go here and ships leave from here
    isReceiving: boolean("is_receiving").notNull().default(false),
    isStaging: boolean("is_staging").notNull().default(false),

    // Whether this location's stock is part of Total Stock at all, and if
    // so which column it shows under (null = the total only).
    countsInTotalStock: boolean("counts_in_total_stock").notNull().default(true),
    stockColumnId: integer("stock_column_id").references(() => stockColumns.id, { onDelete: "restrict" }),

    // Only populated when the type has hasPosition = true (today: RACK)
    area: text("area"), // "A", "B", etc.
    x: integer("x"),    // horizontal position, viewed from front
    y: integer("y"),    // vertical position (level/height), viewed from front

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("locations_code_idx").on(table.code),
    // Receiving or staging, not both.
    check("locations_receiving_or_staging", sql`NOT (${table.isReceiving} AND ${table.isStaging})`),
  ]
);

export const locationTypesRelations = relations(locationTypes, ({ many }) => ({
  locations: many(locations),
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  locations: many(locations),
  stockColumns: many(stockColumns),
}));

export const stockColumnsRelations = relations(stockColumns, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [stockColumns.warehouseId], references: [warehouses.id] }),
  locations: many(locations),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  locationType: one(locationTypes, {
    fields: [locations.type],
    references: [locationTypes.code],
  }),
  stockColumn: one(stockColumns, {
    fields: [locations.stockColumnId],
    references: [stockColumns.id],
  }),
  warehouse: one(warehouses, {
    fields: [locations.warehouseId],
    references: [warehouses.id],
  }),
  pallets: many(pallets),
  palletEvents: many(palletEvents),
}));
