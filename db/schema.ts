import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  pgEnum,
  boolean,
  varchar
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// Locations
// ============================================================

export const locationTypeEnum = pgEnum("location_type", [
  "RACK",
  "FLOOR",
  "DESTROY",
  "LEFTOVER",
  "OUTBOUND_WH",
]);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // e.g. "A1.1", "FLOOR", "DESTROY", "LEFTOVER"
    type: locationTypeEnum("type").notNull(),

    // Only populated when type = RACK
    area: text("area"), // "A", "B", etc.
    x: integer("x"),    // horizontal position, viewed from front
    y: integer("y"),    // vertical position (level/height), viewed from front

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("locations_code_idx").on(table.code)]
);

export const locationsRelations = relations(locations, ({ many }) => ({
  pallets: many(pallets),
  palletEvents: many(palletEvents),
}));

// ============================================================
// Roles & Users
// ============================================================

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(), // e.g. "Inbound", "Forklift Driver", "Admin"
  },
  (table) => [uniqueIndex("roles_name_idx").on(table.name)]
);

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(), // bcrypt/argon2 hash, never plain text
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_username_idx").on(table.username)]
);

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

// ============================================================
// Items (product master)
// ============================================================
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
export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull(),
    legacySku: text("legacy_sku"),
    cartonBarcode: text("carton_barcode"), // physical carton barcode — not unique, variants can share one
    name: text("name").notNull(),
    defaultCode: text("default_code").notNull(),
    cartonBagQty: integer("carton_bag_qty").notNull(),
    palletCartonQty: integer("pallet_carton_qty").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("items_sku_idx").on(table.sku),
    uniqueIndex("items_legacy_sku_idx").on(table.legacySku),
  ]
);

export const itemsRelations = relations(items, ({ many }) => ({
  pallets: many(pallets),
}));

// ============================================================
// Pallets (current state — one row per physical pallet)
// ============================================================

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

// ============================================================
// Pallet events (immutable audit log of every scan)
// ============================================================

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
export const palletEvents = pgTable("pallet_events", {
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
});

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

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  allowDefaultCodeTransactions: boolean("allow_default_code_transactions").notNull().default(true),
  automaticInbound: boolean("automatic_inbound").notNull().default(false),
  automaticInboundFromRack: boolean("automatic_inbound_from_rack").notNull().default(false),
  allowUntrackedOutbound: boolean("allow_untracked_outbound").notNull().default(false),
  allowDefaultPicking: boolean("allow_default_picking").notNull().default(true),
  allowNegativeFloorStock: boolean("allow_negative_floor_stock").notNull().default(false),
  allowNegativeRackStock: boolean("allow_negative_rack_stock").notNull().default(false),
});

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: serial("id").primaryKey(),
    soNumber: text("so_number").notNull(),
    orderDate: timestamp("order_date").notNull(),
    assignedCheckerId: integer("assigned_checker_id").references(() => users.id),
    finishedAt: timestamp("finished_at"),
    finishedBy: integer("finished_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("sales_orders_so_number_idx").on(table.soNumber)]
);

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id")
    .notNull()
    .references(() => salesOrders.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  quantity: integer("quantity").notNull(),
});

export const salesOrdersRelations = relations(salesOrders, ({ many }) => ({
  items: many(salesOrderItems),
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


export const appVersion = pgTable("app_version", {
  id: serial("id").primaryKey(),
  versionCode: integer("version_code").notNull(),
  versionName: text("version_name").notNull(),
  apkUrl: text("apk_url").notNull(),
  releaseNotes: text("release_notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


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
]);

export const locationStockEvents = pgTable("location_stock_events", {
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
});

export const stockOpname = pgTable("stock_opname", {
  opnameNumber: varchar("opname_number", { length: 50 }).primaryKey(),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const stockOpnameItems = pgTable("stock_opname_items", {
  id: serial("id").primaryKey(),
  opnameNumber: varchar("opname_number", { length: 50 })
    .notNull()
    .references(() => stockOpname.opnameNumber),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  palletId: integer("pallet_id").references(() => pallets.id),
  systemSku: text("system_sku"), // nullable — snapshot of system SKU(s) at count time
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty"),
  difference: integer("difference"),
  countedAt: timestamp("counted_at"),
  countedBy: integer("counted_by").references(() => users.id),
});

export const stockOpnameLocations = pgTable(
  "stock_opname_locations",
  {
    id: serial("id").primaryKey(),
    opnameNumber: varchar("opname_number", { length: 50 })
      .notNull()
      .references(() => stockOpname.opnameNumber),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id),
  },
  (table) => [uniqueIndex("stock_opname_locations_unique_idx").on(table.opnameNumber, table.locationId)]
);