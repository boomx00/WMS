import { pgTable, serial, text, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";

// Other Transactions: manual inbound / outbound corrections.

export const otherTransactionTypeEnum = pgEnum("other_transaction_type", ["INBOUND", "OUTBOUND"]);

export const otherTransactions = pgTable(
  "other_transactions",
  {
    id: serial("id").primaryKey(),
    transactionCode: text("transaction_code").notNull(), // "ZXCKWMS-<id>"
    type: otherTransactionTypeEnum("type").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull(),
    notes: text("notes"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Not unique: every line of one batch shares the same ZXCKWMS-<n> code
  // (n = id of the batch's first line, so codes never collide across batches).
  (table) => [index("other_transactions_code_idx").on(table.transactionCode)]);

export const otherTransactionsRelations = relations(otherTransactions, ({ one }) => ({
  item: one(items, { fields: [otherTransactions.itemId], references: [items.id] }),
  location: one(locations, { fields: [otherTransactions.locationId], references: [locations.id] }),
  user: one(users, { fields: [otherTransactions.userId], references: [users.id] }),
}));
