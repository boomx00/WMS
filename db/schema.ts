import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  boolean,
  varchar,
  unique,
  check,
  jsonb,
  numeric,
  date,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import { relations, desc, sql } from "drizzle-orm";
// ============================================================
// Locations
// ============================================================

// Parent locations, e.g. "Finished Goods", "Raw Material" — managed on the
// Locations page (Warehouses tab). Every location belongs to one; Total
// Stock has a tab per warehouse with its own columns. The PDA works in one
// warehouse at a time (chosen after login) and its location pickers start
// on that warehouse's defaults (Settings → Locations & Marking).
export const warehouses = pgTable(
  "warehouses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Inactive: not offered on the PDA and can't get new locations; its
    // existing locations and stock stay and still show on the web.
    isActive: boolean("is_active").notNull().default(true),
    // Must be a receiving / staging location in this warehouse.
    defaultReceivingLocationId: integer("default_receiving_location_id").references((): AnyPgColumn => locations.id, {
      onDelete: "set null",
    }),
    defaultStagingLocationId: integer("default_staging_location_id").references((): AnyPgColumn => locations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("warehouses_name_unique").on(table.name)]
);

// The columns of one warehouse's Total Stock tab (and the sections of its
// per-SKU ledger), managed on Settings → Total Stock Columns. Each location
// picks one of its warehouse's columns as "Shown under", or none (counted
// in the total only).
export const stockColumns = pgTable(
  "stock_columns",
  {
    id: serial("id").primaryKey(),
    warehouseId: integer("warehouse_id")
      .notNull()
      .references((): AnyPgColumn => warehouses.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Good Stock"
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("stock_columns_warehouse_name_unique").on(table.warehouseId, table.name)]
);

// Location types are data, not code: each client defines their own, and
// the app reads these rules instead of checking type names.
export const locationTypes = pgTable(
  "location_types",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // stable key stored in locations.type, e.g. "RACK"
    name: text("name").notNull(), // display name, e.g. "Rack"

    // false = only 1 SKU per location (today: RACK), true = mixed SKUs.
    allowsMultipleSku: boolean("allows_multiple_sku").notNull().default(true),
    // Locations of this type have Area / X / Y and appear on the warehouse map.
    hasPosition: boolean("has_position").notNull().default(false),
    // Can be picked from. Pickable + multiple SKU also allows Default Picking.
    pickable: boolean("pickable").notNull().default(false),
    // Max pallets' worth of stock per location; null = no limit.
    maxPallets: integer("max_pallets"),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("location_types_code_unique").on(table.code)]
);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // e.g. "A1.1", "FLOOR", "DESTROY", "LEFTOVER"
    type: text("type")
      .notNull()
      .references(() => locationTypes.code, { onUpdate: "cascade", onDelete: "restrict" }),
    // The parent location (warehouse) this location belongs to.
    warehouseId: integer("warehouse_id")
      .notNull()
      .references((): AnyPgColumn => warehouses.id, { onDelete: "restrict" }),
    // What the location is used for. Any number of locations can have each;
    // the PDA picks one (default on Settings → General).
    //   isReceiving = inbound lands here; Move Floor → Rack takes from here
    //   isStaging   = picks go here and ships leave from here
    isReceiving: boolean("is_receiving").notNull().default(false),
    isStaging: boolean("is_staging").notNull().default(false),

    // Whether this location's stock is part of Total Stock at all, and if
    // so which column it shows under (null = the total only).
    countsInTotalStock: boolean("counts_in_total_stock").notNull().default(true),
    stockColumnId: integer("stock_column_id").references(() => stockColumns.id, { onDelete: "restrict" }),

    // Only populated when the type has hasPosition = true (today: RACK)
    area: text("area"), // "A", "B", etc.
    x: integer("x"),    // horizontal position, viewed from front
    y: integer("y"),    // vertical position (level/height), viewed from front

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("locations_code_idx").on(table.code),
    // Receiving or staging, not both.
    check("locations_receiving_or_staging", sql`NOT (${table.isReceiving} AND ${table.isStaging})`),
  ]
);

export const locationTypesRelations = relations(locationTypes, ({ many }) => ({
  locations: many(locations),
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  locations: many(locations),
  stockColumns: many(stockColumns),
}));

export const stockColumnsRelations = relations(stockColumns, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [stockColumns.warehouseId], references: [warehouses.id] }),
  locations: many(locations),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  locationType: one(locationTypes, {
    fields: [locations.type],
    references: [locationTypes.code],
  }),
  stockColumn: one(stockColumns, {
    fields: [locations.stockColumnId],
    references: [stockColumns.id],
  }),
  warehouse: one(warehouses, {
    fields: [locations.warehouseId],
    references: [warehouses.id],
  }),
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
    name: text("name").notNull(), // e.g. "Inbound", "Forklift Driver", "Manager"
  },
  (table) => [uniqueIndex("roles_name_idx").on(table.name)]
);

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  pagePermissions: many(rolePagePermissions),
  actionPermissions: many(roleActionPermissions),
  pdaPermissions: many(rolePdaPermissions),
}));

// Which web pages a (non-Manager) role may open. One row = one granted page.
// Manager always has every page and never needs rows here. `pagePath` must be
// a grantable path from APP_PAGES in lib/pages.ts.
export const rolePagePermissions = pgTable(
  "role_page_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    pagePath: text("page_path").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("role_page_permissions_role_page_idx").on(table.roleId, table.pagePath)]
);

export const rolePagePermissionsRelations = relations(rolePagePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePagePermissions.roleId],
    references: [roles.id],
  }),
}));

// Which in-page actions a (non-Manager) role may do, e.g. "so.create".
// `actionKey` must be a key from APP_ACTIONS in lib/pages.ts. An action only
// takes effect if the role can also open that action's page.
export const roleActionPermissions = pgTable(
  "role_action_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    actionKey: text("action_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("role_action_permissions_role_action_idx").on(table.roleId, table.actionKey)]
);

// Which permission keys (APP_ACTIONS in lib/pages.ts) have already been
// granted to the roles that had the permission they were split from — see
// scripts/migration-location-types.sql. Not used by the app itself.
export const permissionSeeds = pgTable("permission_seeds", {
  actionKey: text("action_key").primaryKey(),
  seededAt: timestamp("seeded_at").defaultNow().notNull(),
});

export const roleActionPermissionsRelations = relations(roleActionPermissions, ({ one }) => ({
  role: one(roles, {
    fields: [roleActionPermissions.roleId],
    references: [roles.id],
  }),
}));

// Which PDA features a (non-Manager) role may use, e.g. "pda.ship".
// `pdaKey` must be a key from PDA_FEATURES in lib/pdaFeatures.ts. Manager
// always has every feature and never needs rows here.
export const rolePdaPermissions = pgTable(
  "role_pda_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    pdaKey: text("pda_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("role_pda_permissions_role_key_idx").on(table.roleId, table.pdaKey)]
);

export const rolePdaPermissionsRelations = relations(rolePdaPermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePdaPermissions.roleId],
    references: [roles.id],
  }),
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
    disabledAt: timestamp("disabled_at"),
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

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  allowDefaultCodeTransactions: boolean("allow_default_code_transactions").notNull().default(true),
  automaticInbound: boolean("automatic_inbound").notNull().default(false),
  automaticInboundFromRack: boolean("automatic_inbound_from_rack").notNull().default(false),
  allowUntrackedOutbound: boolean("allow_untracked_outbound").notNull().default(false),
  allowDefaultPicking: boolean("allow_default_picking").notNull().default(true),
  allowNegativeFloorStock: boolean("allow_negative_floor_stock").notNull().default(false),
  allowNegativeRackStock: boolean("allow_negative_rack_stock").notNull().default(false),
  // Total Stock ledgers are shown from this moment forward. Null = fall back
  // to DEFAULT_LEDGER_START_AT in lib/ledger.ts. Stored as UTC wall time.
  ledgerStartAt: timestamp("ledger_start_at"),
  // Order marking: picked stock in a staging location is reserved for the
  // SO / Tambahan it was picked for. Off = staging stock is one shared pool
  // any order can ship from (picking still counts per SO).
  markingEnabled: boolean("marking_enabled").notNull().default(true),
});
export const itemLedgerAnchors = pgTable(
  "item_ledger_anchors",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    openingQuantity: integer("opening_quantity").notNull(),
    openingAt: timestamp("opening_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("item_ledger_anchors_item_idx").on(table.itemId)]
);
export const salesOrders = pgTable(
  "sales_orders",
  {
    id: serial("id").primaryKey(),
    soNumber: text("so_number").notNull(),
    orderDate: timestamp("order_date").notNull(),
    assignedCheckerId: integer("assigned_checker_id").references(() => users.id),
    finishedAt: timestamp("finished_at"),
    finishedBy: integer("finished_by").references(() => users.id),
    truckEnterTime: timestamp("truck_enter_time", { mode: "string" }),
    truckLeaveTime: timestamp("truck_leave_time", { mode: "string" }),
    // The staging location the PDA last chose to pick this SO into ("Pick
    // to"); the picking screen starts on it next time the SO is opened.
    pickToLocationId: integer("pick_to_location_id").references(() => locations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
(table) => [uniqueIndex("sales_orders_so_number_idx").on(table.soNumber), index("sales_orders_order_date_idx").on(desc(table.orderDate))]
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
    "OTHER_INBOUND",
  "OTHER_OUTBOUND",
]);

export const locationStockEvents = pgTable(
  "location_stock_events",
  {
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
    // nullable — set instead of salesOrderId for picking/shipping done under a
    // Tambahan batch, before the real new SO number exists
    tambahanOrderId: integer("tambahan_order_id").references(() => tambahanOrders.id),
    otherTransactionId: integer("other_transaction_id").references(() => otherTransactions.id),
    bulkAdjustmentId: integer("bulk_adjustment_id").references(() => bulkAdjustments.id),
    workOrderNumber: text("work_order_number"), // MO number, set only on INBOUND/DEFAULT_INBOUND events
  },
  (table) => [
    index("location_stock_events_item_created_idx").on(table.itemId, table.createdAt),
    index("location_stock_events_source_loc_idx").on(table.sourceLocationId),
    index("location_stock_events_dest_loc_idx").on(table.destinationLocationId),
        index("location_stock_events_created_at_id_idx").on(desc(table.createdAt), desc(table.id)),
index("location_stock_events_sales_order_idx").on(table.salesOrderId, table.itemId)

  ]
);
  


export type OpnameColumnSnapshotRow = {
  locationId: number;
  warehouseId: number;
  stockColumnId: number | null;
  countsInTotalStock: boolean;
  qty: number;
};

export const stockOpname = pgTable("stock_opname", {
  opnameNumber: varchar("opname_number", { length: 50 }).primaryKey(),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  confirmedAt: timestamp("confirmed_at"),                          // ADD
  confirmedBy: integer("confirmed_by").references(() => users.id), // ADD
  confirmDescription: text("confirm_description"),                 // ADD
  confirmedBulkAdjustmentId: integer("confirmed_bulk_adjustment_id"), // ADD — no .references() here to avoid a same-file circular type issue; FK is enforced at the DB level by the migration above

});

// ============================================================
// K3 stock (Stock Opname Summary → Import K3)
// ============================================================

// The main system's (K3) stock of every product on one date, imported from
// its "Real-time Inventory" export on the Stock Opname Summary: Inventory
// Qty (CUoM) of the rows whose Inventory Status is Good Stock, summed per
// Material Code (= items.sku). One import per WMS warehouse per date;
// importing again for the same date replaces it.
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
  (table) => [uniqueIndex("k3_stock_imports_warehouse_date_idx").on(table.warehouseId, table.stockDate)]
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
export const stockOpnameSkus = pgTable(
  "stock_opname_skus",
  {
    id: serial("id").primaryKey(),
    opnameNumber: varchar("opname_number", { length: 50 }).notNull().references(() => stockOpname.opnameNumber),
    itemId: integer("item_id").notNull().references(() => items.id),
    systemQty: integer("system_qty").notNull(),
    addedBy: integer("added_by").references(() => users.id),
    addedAt: timestamp("added_at").defaultNow().notNull(),
    adjustmentNote: text("adjustment_note"),
    adjustedAt: timestamp("adjusted_at"),
    adjustedBy: integer("adjusted_by").references(() => users.id),
    // Where the locked system stock was, location by location, with each
    // location's warehouse / Total Stock column AS THEY WERE at lock time —
    // so the Stock Opname Summary keeps showing past opnames the same way
    // after a location's settings change. Null for opnames from before this
    // was recorded (the summary then rebuilds it from the ledger).
    columnSnapshot: jsonb("column_snapshot").$type<OpnameColumnSnapshotRow[]>(),
  },
  (table) => [uniqueIndex("stock_opname_skus_unique_idx").on(table.opnameNumber, table.itemId)]
);


export const pageLabels = pgTable("page_labels", {
  id: serial("id").primaryKey(),
  page: text("page").notNull(),
  key: text("key").notNull(),
  textEn: text("text_en"),
  textId: text("text_id"),
  textZh: text("text_zh"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  pageKeyUnique: unique("page_labels_page_key_unique").on(table.page, table.key),
}));


export const stockOpnameItems = pgTable("stock_opname_items", {
  id: serial("id").primaryKey(),
  opnameNumber: varchar("opname_number", { length: 50 })
    .notNull()
    .references(() => stockOpname.opnameNumber),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  // Nullable — a null itemId represents a location the PIC confirmed was
  // physically empty (they typed only the location and left SKU/qty
  // blank), as opposed to a location that hasn't been visited at all yet.
  itemId: integer("item_id").references(() => items.id),
  palletId: integer("pallet_id").references(() => pallets.id),
  systemSku: text("system_sku"), // nullable — snapshot of system SKU(s) at count time
  systemQty: integer("system_qty").notNull(),
  countedQty: integer("counted_qty"),
  difference: integer("difference"),
  countedAt: timestamp("counted_at"),
  countedBy: integer("counted_by").references(() => users.id),
  // The location's warehouse / Total Stock settings when it was first
  // counted (see stock_opname_skus.column_snapshot). No foreign keys: a
  // column deleted later shouldn't block anything. Null on older lines.
  snapshotWarehouseId: integer("snapshot_warehouse_id"),
  snapshotStockColumnId: integer("snapshot_stock_column_id"),
  snapshotCountsInTotal: boolean("snapshot_counts_in_total"),
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

export const stockOpnameCountEvents = pgTable("stock_opname_count_events", {
  id: serial("id").primaryKey(),
  opnameNumber: varchar("opname_number", { length: 50 })
    .notNull()
    .references(() => stockOpname.opnameNumber),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id),
  itemId: integer("item_id").references(() => items.id), // null = a confirmed-empty commit
  delta: integer("delta").notNull(),
  resultingTotal: integer("resulting_total").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// ============================================================
// Tambahan (extra picks against an already-fulfilled SO, pending
// a real new SO number)
// ============================================================

// ============================================================
// Tambahan (extra picks against an already-fulfilled SO, pending
// a real new SO number)
// ============================================================

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

// ============================================================
// Other Transactions (manual inbound/outbound corrections outside
// the normal Inbound/Picking/Shipping flows)
// ============================================================

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
// ============================================================
// Bulk Adjustments (multi-row stock overrides — from the Scan page's
// Adjust Bulk tab, or attached to a Stock Opname confirmation)
// ============================================================

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