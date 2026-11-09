import { pgTable, serial, text, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";

// Loose packs (Other Transactions → Packs): opening cartons into loose packs
// and packing them back into cartons. Each row writes two ledger rows in
// location_stock_events (pack_transaction_id), see locationStock.ts.

export const packTransactionTypeEnum = pgEnum("pack_transaction_type", ["UNPACK", "REPACK"]);

export const packTransactions = pgTable(
  "pack_transactions",
  {
    id: serial("id").primaryKey(),
    transactionCode: text("transaction_code").notNull(), // "PACK-<id>"
    type: packTransactionTypeEnum("type").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    // UNPACK: where the cartons were taken from (e.g. DEFECT).
    // REPACK: where the packed cartons were put.
    cartonLocationId: integer("carton_location_id")
      .notNull()
      .references(() => locations.id),
    // The packs location the packs went into (UNPACK) or came from (REPACK).
    packLocationId: integer("pack_location_id")
      .notNull()
      .references(() => locations.id),
    cartons: integer("cartons").notNull(),
    // UNPACK: good packs kept as loose packs. REPACK: packs used.
    packs: integer("packs").notNull(),
    // UNPACK only: packs thrown away (cartons × packs per carton − good packs).
    damagedPacks: integer("damaged_packs").notNull().default(0),
    // The item's packs per carton at the time, so old rows stay readable if
    // the Items page value changes later.
    packsPerCarton: integer("packs_per_carton").notNull(),
    notes: text("notes"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pack_transactions_created_idx").on(table.createdAt)]
);

export const packTransactionsRelations = relations(packTransactions, ({ one }) => ({
  item: one(items, { fields: [packTransactions.itemId], references: [items.id] }),
  user: one(users, { fields: [packTransactions.userId], references: [users.id] }),
}));
