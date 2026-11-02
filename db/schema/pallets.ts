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
import { locations } from "./locations";
import { users } from "./users";
import { items } from "./items";
import { salesOrders } from "./salesOrders";

// v1 pallets: current pallet state and the pallet scan event log.

export const palletStatusEnum = pgEnum("pallet_status", [
  "ACTIVE",
  "PENDING",
  "OUTBOUND",
]);

export const pallets = pgTable(
  "pallets",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    // The label exactly as printed/scanned (may carry a legacy sku, e.g.
    // *5020004006*0024*5000*MO008213). `label` above is always rewritten to
    // the current sku and is what every lookup uses; this is display-only.
    // Null for pallets inbounded before this column existed.
    printedLabel: text("printed_label"),

    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    workOrderNumber: text("work_order_number").notNull(),
    quantity: integer("quantity").notNull(),

    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    status: palletStatusEnum("status").notNull().default("ACTIVE"),

    // Traceability: if this pallet was created by splitting another one,
    // this points back to the original. Null for pallets scanned in normally.
    splitFromPalletId: integer("split_from_pallet_id"),

    inboundUserId: integer("inbound_user_id")
      .notNull()
      .references(() => users.id),
    inForkliftUserId: integer("in_forklift_user_id").references(() => users.id),
    outForkliftUserId: integer("out_forklift_user_id").references(() => users.id),

    inboundAt: timestamp("inbound_at").defaultNow().notNull(),
    firstRackedAt: timestamp("first_racked_at"),
    removedAt: timestamp("removed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pallets_label_location_idx").on(table.label, table.locationId)]
);

export const palletsRelations = relations(pallets, ({ one, many }) => ({
  item: one(items, {
    fields: [pallets.itemId],
    references: [items.id],
  }),
  location: one(locations, {
    fields: [pallets.locationId],
    references: [locations.id],
  }),
  inboundUser: one(users, {
    fields: [pallets.inboundUserId],
    references: [users.id],
    relationName: "inbound_user",
  }),
  inForkliftUser: one(users, {
    fields: [pallets.inForkliftUserId],
    references: [users.id],
    relationName: "in_forklift_user",
  }),
  outForkliftUser: one(users, {
    fields: [pallets.outForkliftUserId],
    references: [users.id],
    relationName: "out_forklift_user",
  }),
  events: many(palletEvents),
}));

export const palletEventTypeEnum = pgEnum("pallet_event_type", [
  "INBOUND",
  "DEFAULT_INBOUND",
  "MOVED",
  "SPLIT",
  "CONFIRMED",
  "OUTBOUND",
  "DEFAULT_OUTBOUND",
  "ADJUSTMENT",
]);

export const palletEvents = pgTable(
  "pallet_events",
  {
    id: serial("id").primaryKey(),
    palletId: integer("pallet_id")
      .notNull()
      .references(() => pallets.id),
    type: palletEventTypeEnum("type").notNull(),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    quantity: integer("quantity").notNull(),
    salesOrderId: integer("sales_order_id").references(() => salesOrders.id), // nullable — only set for Ship events
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pallet_events_sales_order_idx").on(table.salesOrderId)]
);

export const palletEventsRelations = relations(palletEvents, ({ one }) => ({
  pallet: one(pallets, {
    fields: [palletEvents.palletId],
    references: [pallets.id],
  }),
  location: one(locations, {
    fields: [palletEvents.locationId],
    references: [locations.id],
  }),
  user: one(users, {
    fields: [palletEvents.userId],
    references: [users.id],
  }),
}));
