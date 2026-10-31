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
import { relations } from "drizzle-orm";
import { users } from "./users";
import { salesOrders } from "./salesOrders";

// Tambahan orders: extra picks against an already-fulfilled SO.

export const tambahanStatusEnum = pgEnum("tambahan_status", ["ACTIVE", "CONVERTED"]);

export const tambahanOrders = pgTable(
  "tambahan_orders",
  {
    id: serial("id").primaryKey(),
    tambahanNumber: text("tambahan_number").notNull(), // "TBH-<parent so_number>"
    parentSalesOrderId: integer("parent_sales_order_id")
      .notNull()
      .references(() => salesOrders.id),
    status: tambahanStatusEnum("status").notNull().default("ACTIVE"),
    // Filled in once the real new SO number is issued and this is converted.
    convertedSalesOrderId: integer("converted_sales_order_id").references(() => salesOrders.id),
    convertedAt: timestamp("converted_at"),
    convertedBy: integer("converted_by").references(() => users.id),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
        convertedSoNumber: text("converted_so_number"), // just the paperwork number — no FK, no separate SO row
  },
  (table) => [
    uniqueIndex("tambahan_orders_number_idx").on(table.tambahanNumber),
    index("tambahan_orders_parent_so_idx").on(table.parentSalesOrderId),
  ]
);

export const tambahanOrdersRelations = relations(tambahanOrders, ({ one }) => ({
  parentSalesOrder: one(salesOrders, {
    fields: [tambahanOrders.parentSalesOrderId],
    references: [salesOrders.id],
  }),
  convertedSalesOrder: one(salesOrders, {
    fields: [tambahanOrders.convertedSalesOrderId],
    references: [salesOrders.id],
  }),
}));
