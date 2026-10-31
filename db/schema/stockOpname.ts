import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  boolean,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";
import { pallets } from "./pallets";

// Stock opname (inventory count) sessions, their SKUs, items, locations and count events.

export type OpnameColumnSnapshotRow = {
  locationId: number;
  warehouseId: number;
  stockColumnId: number | null;
  countsInTotalStock: boolean;
  qty: number;
};

export const stockOpname = pgTable("stock_opname", {
  opnameNumber: varchar("opname_number", { length: 50 }).primaryKey(),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  confirmedAt: timestamp("confirmed_at"),                          // ADD
  confirmedBy: integer("confirmed_by").references(() => users.id), // ADD
  confirmDescription: text("confirm_description"),                 // ADD
  confirmedBulkAdjustmentId: integer("confirmed_bulk_adjustment_id"), // ADD — no .references() here to avoid a same-file circular type issue; FK is enforced at the DB level by the migration above

});

export const stockOpnameSkus = pgTable(
  "stock_opname_skus",
  {
    id: serial("id").primaryKey(),
    opnameNumber: varchar("opname_number", { length: 50 }).notNull().references(() => stockOpname.opnameNumber),
    itemId: integer("item_id").notNull().references(() => items.id),
    systemQty: integer("system_qty").notNull(),
    addedBy: integer("added_by").references(() => users.id),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    adjustmentNote: text("adjustment_note"),
    adjustedAt: timestamp("adjusted_at"),
    adjustedBy: integer("adjusted_by").references(() => users.id),
    // Reconciliation typed in the Stock Opname Summary's report: quantity
    // added to (+) and taken off (−) the counted Total SO, giving the
    // Final SO (Total SO + plus − minus).
    reconcilePlus: integer("reconcile_plus").notNull().default(0),
    reconcileMinus: integer("reconcile_minus").notNull().default(0),
    reconciledAt: timestamp("reconciled_at"),
    reconciledBy: integer("reconciled_by").references(() => users.id),
    // Where the locked system stock was, location by location, with each
    // location's warehouse / Total Stock column AS THEY WERE at lock time —
    // so the Stock Opname Summary keeps showing past opnames the same way
    // after a location's settings change. Null for opnames from before this
    // was recorded (the summary then rebuilds it from the ledger).
    columnSnapshot: jsonb("column_snapshot").$type<OpnameColumnSnapshotRow[]>(),
  },
  (table) => [uniqueIndex("stock_opname_skus_unique_idx").on(table.opnameNumber, table.itemId)]
);

export const stockOpnameItems = pgTable("stock_opname_items", {
  id: serial("id").primaryKey(),
  opnameNumber: varchar("opname_number", { length: 50 })
    .notNull()
    .references(() => stockOpname.opnameNumber),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  // Nullable — a null itemId represents a location the PIC confirmed was
  // physically empty (they typed only the location and left SKU/qty
  // blank), as opposed to a location that hasn't been visited at all yet.
  itemId: integer("item_id").references(() => items.id),
  palletId: integer("pallet_id").references(() => pallets.id),
  systemSku: text("system_sku"), // nullable — snapshot of system SKU(s) at count time
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty"),
  difference: integer("difference"),
  countedAt: timestamp("counted_at"),
  countedBy: integer("counted_by").references(() => users.id),
  // The location's warehouse / Total Stock settings when it was first
  // counted (see stock_opname_skus.column_snapshot). No foreign keys: a
  // column deleted later shouldn't block anything. Null on older lines.
  snapshotWarehouseId: integer("snapshot_warehouse_id"),
  snapshotStockColumnId: integer("snapshot_stock_column_id"),
  snapshotCountsInTotal: boolean("snapshot_counts_in_total"),
});

export const stockOpnameLocations = pgTable(
  "stock_opname_locations",
  {
    id: serial("id").primaryKey(),
    opnameNumber: varchar("opname_number", { length: 50 })
      .notNull()
      .references(() => stockOpname.opnameNumber),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
  },
  (table) => [uniqueIndex("stock_opname_locations_unique_idx").on(table.opnameNumber, table.locationId)]
);

export const stockOpnameCountEvents = pgTable("stock_opname_count_events", {
  id: serial("id").primaryKey(),
  opnameNumber: varchar("opname_number", { length: 50 })
    .notNull()
    .references(() => stockOpname.opnameNumber),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  itemId: integer("item_id").references(() => items.id), // null = a confirmed-empty commit
  delta: integer("delta").notNull(),
  resultingTotal: integer("resulting_total").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
