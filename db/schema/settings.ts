import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";

// App-wide settings, the PDA app version, and per-page label overrides.

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
  // Office hour: when the Dashboard's office day starts, in minutes after
  // midnight WIB (420 = 07:00). Each day runs from this time to the same
  // time the next day — production works 07:00 → 07:00.
  officeDayStartMinutes: integer("office_day_start_minutes").notNull().default(420),
});

export const appVersion = pgTable("app_version", {
  id: serial("id").primaryKey(),
  versionCode: integer("version_code").notNull(),
  versionName: text("version_name").notNull(),
  apkUrl: text("apk_url").notNull(),
  releaseNotes: text("release_notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
