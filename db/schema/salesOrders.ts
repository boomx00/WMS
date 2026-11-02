import { pgTable, serial, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations, desc, sql } from "drizzle-orm";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";

// Sales orders, their lines and document types, and shipment revisions.

export const shipmentRevisions = pgTable("shipment_revisions", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id")
    .notNull()
    .references(() => salesOrders.id),
  originalItemId: integer("original_item_id")
    .notNull()
    .references(() => items.id),
  revisedItemId: integer("revised_item_id")
    .notNull()
    .references(() => items.id),
  quantity: integer("quantity").notNull(),
  reason: text("reason"),
  revisedBy: integer("revised_by")
    .notNull()
    .references(() => users.id),
  revisedAt: timestamp("revised_at").defaultNow().notNull(),
});

// Sales order document types (e.g. SO, HPT), managed on Sales Orders →
// Sales Order Types. Every new sales order picks one; older orders may have
// none. Names are unique ignoring case.
// numberPrefix: the fixed start of this type's SO numbers, e.g. "SO-" —
// the create form puts it in front of the typed number. Null = the whole
// number is typed.
export const salesOrderTypes = pgTable(
  "sales_order_types",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    numberPrefix: text("number_prefix"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("sales_order_types_name_idx").on(sql`lower(${table.name})`)]
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: serial("id").primaryKey(),
    soNumber: text("so_number").notNull(),
    orderDate: timestamp("order_date").notNull(),
    // Document type (sales_order_types). Null for orders created before
    // types existed.
    salesOrderTypeId: integer("sales_order_type_id").references(() => salesOrderTypes.id, { onDelete: "restrict" }),
    assignedCheckerId: integer("assigned_checker_id").references(() => users.id),
    finishedAt: timestamp("finished_at"),
    finishedBy: integer("finished_by").references(() => users.id),
    // LEGACY — no longer read or written. Truck enter / leave are now taken
    // from the stock ledger (first pick / last ship), see lib/truckTimes.ts.
    // Kept so the old hand-typed values aren't lost; safe to drop later.
    truckEnterTime: timestamp("truck_enter_time", { mode: "string" }),
    truckLeaveTime: timestamp("truck_leave_time", { mode: "string" }),
    // The staging location the PDA last chose to pick this SO into ("Pick
    // to"); the picking screen starts on it next time the SO is opened.
    pickToLocationId: integer("pick_to_location_id").references(() => locations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
(table) => [
  uniqueIndex("sales_orders_so_number_idx").on(table.soNumber),
  index("sales_orders_order_date_idx").on(desc(table.orderDate)),
  index("sales_orders_type_idx").on(table.salesOrderTypeId),
]
);

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: serial("id").primaryKey(),
    salesOrderId: integer("sales_order_id")
      .notNull()
      .references(() => salesOrders.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    quantity: integer("quantity").notNull(),
  },
  (table) => [index("sales_order_items_sales_order_idx").on(table.salesOrderId)]
);

export const salesOrdersRelations = relations(salesOrders, ({ one, many }) => ({
  items: many(salesOrderItems),
  salesOrderType: one(salesOrderTypes, {
    fields: [salesOrders.salesOrderTypeId],
    references: [salesOrderTypes.id],
  }),
}));

export const salesOrderTypesRelations = relations(salesOrderTypes, ({ many }) => ({
  salesOrders: many(salesOrders),
}));

export const salesOrderItemsRelations = relations(salesOrderItems, ({ one }) => ({
  salesOrder: one(salesOrders, {
    fields: [salesOrderItems.salesOrderId],
    references: [salesOrders.id],
  }),
  item: one(items, {
    fields: [salesOrderItems.itemId],
    references: [items.id],
  }),
}));
