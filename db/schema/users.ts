import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Roles, page / action / PDA permissions, and users.

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
