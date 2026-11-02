import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { locations } from "./locations";
import { users } from "./users";
import { suppliers, items } from "./items";
import { salesOrders } from "./salesOrders";
import { tambahanOrders } from "./tambahan";
import { otherTransactions } from "./otherTransactions";
import { bulkAdjustments } from "./bulkAdjustments";

// v2 stock: location_stock (source of truth) and location_stock_events (the ledger).

export const locationStock = pgTable(
  "location_stock",
  {
    id: serial("id").primaryKey(),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("location_stock_location_item_idx").on(table.locationId, table.itemId)]
);

export const locationStockEventTypeEnum = pgEnum("location_stock_event_type", [
  "PICKING",
  "DEFAULT_PICKING",
  "SHIP",
  "INBOUND",
  "DEFAULT_INBOUND",
  "MOVE",
  "DEFAULT_MOVE",
  "ADJUSTMENT",
  "RELEASE",
  "CLAIM",
    "OTHER_INBOUND",
  "OTHER_OUTBOUND",
  // A deleted sales order's stock put back on FLOOR: from the staging
  // location it was marked in, or (for what had already shipped) from
  // nowhere. Its SO number is kept in deleted_so_number.
  "DELETE_SO",
]);

export const locationStockEvents = pgTable(
  "location_stock_events",
  {
    id: serial("id").primaryKey(),
    type: locationStockEventTypeEnum("type").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    sourceLocationId: integer("source_location_id").references(() => locations.id),
    destinationLocationId: integer("destination_location_id").references(() => locations.id), // nullable now — SHIP events have no destination location
    salesOrderId: integer("sales_order_id").references(() => salesOrders.id), // nullable — only set for SHIP events
    quantity: integer("quantity").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // nullable — set instead of salesOrderId for picking/shipping done under a
    // Tambahan batch, before the real new SO number exists
    tambahanOrderId: integer("tambahan_order_id").references(() => tambahanOrders.id),
    otherTransactionId: integer("other_transaction_id").references(() => otherTransactions.id),
    bulkAdjustmentId: integer("bulk_adjustment_id").references(() => bulkAdjustments.id),
    workOrderNumber: text("work_order_number"), // MO number, set only on INBOUND/DEFAULT_INBOUND events
    // The SO number of a sales order that was deleted: its events lose
    // salesOrderId (the SO row is gone) but keep showing the number.
    deletedSoNumber: text("deleted_so_number"),
    // Who the stock came from: production inbound (INBOUND / DEFAULT_INBOUND
    // from the PDA) is set to the Production supplier automatically.
    supplierId: integer("supplier_id").references(() => suppliers.id),
  },
  (table) => [
    index("location_stock_events_item_created_idx").on(table.itemId, table.createdAt),
    index("location_stock_events_source_loc_idx").on(table.sourceLocationId),
    index("location_stock_events_dest_loc_idx").on(table.destinationLocationId),
        index("location_stock_events_created_at_id_idx").on(desc(table.createdAt), desc(table.id)),
index("location_stock_events_sales_order_idx").on(table.salesOrderId, table.itemId)

  ]
);
