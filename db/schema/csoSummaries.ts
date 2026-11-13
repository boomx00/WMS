import { pgTable, serial, text, integer, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";
import { qty } from "./qty";

// CSO Summaries (Stock Opname → Verify Stock Integrity → CSO Summary).
//
// One row per stock opname activity (e.g. "Opname Akhir Bulan November").
// Creating it locks the whole system stock — every location's quantity per
// SKU — into cso_summary_stock, so the CSO sessions counted for the activity
// are compared against the stock AS IT WAS when the activity started, not
// against live stock that keeps moving while people count.
export const csoSummaries = pgTable("cso_summaries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // The CSO sessions last combined in this summary, so opening the card again
  // starts with the same ones ticked.
  opnameNumbers: jsonb("opname_numbers").$type<string[]>().notNull().default([]),
});

// The locked stock of a CSO Summary: location_stock rows with stock at the
// moment the summary was created (rows at 0 are left out). Same columns as
// location_stock: quantity in cartons, loose packs at packs locations.
export const csoSummaryStock = pgTable(
  "cso_summary_stock",
  {
    id: serial("id").primaryKey(),
    summaryId: integer("summary_id")
      .notNull()
      .references(() => csoSummaries.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    quantity: qty("quantity").notNull().default(0),
    loosePacks: integer("loose_packs").notNull().default(0),
  },
  (table) => [index("cso_summary_stock_summary_idx").on(table.summaryId)]
);
