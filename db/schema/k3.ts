import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  varchar,
  jsonb,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { warehouses } from "./locations";
import { users } from "./users";
import { items } from "./items";
import { stockOpname } from "./stockOpname";

// K3 stock imports (Stock Opname Summary → Import K3).

// The main system's (K3) stock of every product, imported from its
// "Real-time Inventory" export on the Stock Opname Summary: Inventory Qty
// (CUoM) of the rows whose Warehouse Name is MCI Warehouse and Inventory
// Status is Good Stock, summed per Material Code (= items.sku). Each user
// pulls their own export, so an import belongs to the SOSKU sessions it was
// imported for (k3_stock_import_sessions) — one file can serve several
// sessions; a date can have several imports.
export const k3StockImports = pgTable(
  "k3_stock_imports",
  {
    id: serial("id").primaryKey(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    stockDate: date("stock_date", { mode: "string" }).notNull(), // YYYY-MM-DD, the summary's date column
    fileName: text("file_name"),
    goodStockRows: integer("good_stock_rows").notNull().default(0), // Good Stock rows read from the file
    // Material codes in the file that match no WMS item (left out of the lines).
    unmatched: jsonb("unmatched")
      .$type<{ code: string; name: string | null; quantity: number }[]>()
      .notNull()
      .default([]),
    importedBy: integer("imported_by").references(() => users.id),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (table) => [index("k3_stock_imports_warehouse_date_idx").on(table.warehouseId, table.stockDate)]
);

// Which K3 import each SOSKU session is compared against (at most one per
// session; importing again for a session replaces its link). An import no
// session uses any more is deleted.
export const k3StockImportSessions = pgTable(
  "k3_stock_import_sessions",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => k3StockImports.id, { onDelete: "cascade" }),
    opnameNumber: varchar("opname_number", { length: 50 })
      .notNull()
      .references(() => stockOpname.opnameNumber, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("k3_stock_import_sessions_opname_idx").on(table.opnameNumber),
    index("k3_stock_import_sessions_import_idx").on(table.importId),
  ]
);

export const k3StockLines = pgTable(
  "k3_stock_lines",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => k3StockImports.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    // K3 counts in its own unit (CUoM) and can hold fractions, e.g. 0.5 box.
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("k3_stock_lines_import_item_idx").on(table.importId, table.itemId)]
);
