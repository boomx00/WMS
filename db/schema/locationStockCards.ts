import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// The summary cards at the top of the Location Stock page (Settings →
// Location Stock Cards). Each card adds up the stock in the location types
// ticked for it, shown in its units.
export const locationStockCards = pgTable("location_stock_cards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g. "Total Floor"
  nameId: text("name_id"), // Indonesian name (null = use name)
  nameZh: text("name_zh"), // Chinese name (null = use name)
  // location_types.code of every type that adds to this card.
  locationTypes: text("location_types").array().notNull().default(sql`'{}'::text[]`),
  // units.id the card's total is shown in, in order (one line each).
  // Null / empty = automatic: each product's primary unit.
  unitIds: integer("unit_ids").array(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
