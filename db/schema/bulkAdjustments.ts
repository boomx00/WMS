import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  pgEnum,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";
import { stockOpname } from "./stockOpname";

// Bulk Adjustments: multi-row stock overrides and their lines.

export const bulkAdjustmentSourceEnum = pgEnum("bulk_adjustment_source", ["SCAN", "STOCK_OPNAME"]);

export const bulkAdjustments = pgTable(
  "bulk_adjustments",
  {
    id: serial("id").primaryKey(),
    adjustmentCode: text("adjustment_code").notNull(), // "BADJ-<id>" (scan) or "OPADJ-<id>" (stock opname)
    source: bulkAdjustmentSourceEnum("source").notNull().default("SCAN"),
    description: text("description"),
    opnameNumber: varchar("opname_number", { length: 50 }).references(() => stockOpname.opnameNumber),
    lineCount: integer("line_count").notNull().default(0),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("bulk_adjustments_code_idx").on(table.adjustmentCode)]
);

export const bulkAdjustmentLines = pgTable("bulk_adjustment_lines", {
  id: serial("id").primaryKey(),
  bulkAdjustmentId: integer("bulk_adjustment_id")
    .notNull()
    .references(() => bulkAdjustments.id),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  previousQuantity: integer("previous_quantity").notNull(),
  newQuantity: integer("new_quantity").notNull(),
  delta: integer("delta").notNull(),
});

export const bulkAdjustmentsRelations = relations(bulkAdjustments, ({ one, many }) => ({
  user: one(users, { fields: [bulkAdjustments.userId], references: [users.id] }),
  opname: one(stockOpname, { fields: [bulkAdjustments.opnameNumber], references: [stockOpname.opnameNumber] }),
  lines: many(bulkAdjustmentLines),
}));

export const bulkAdjustmentLinesRelations = relations(bulkAdjustmentLines, ({ one }) => ({
  bulkAdjustment: one(bulkAdjustments, {
    fields: [bulkAdjustmentLines.bulkAdjustmentId],
    references: [bulkAdjustments.id],
  }),
  location: one(locations, { fields: [bulkAdjustmentLines.locationId], references: [locations.id] }),
  item: one(items, { fields: [bulkAdjustmentLines.itemId], references: [items.id] }),
}));
