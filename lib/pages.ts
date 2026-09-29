// Web pages and in-page actions that permissions apply to. Safe to import
// from client components (no DB access here).
//
// - Manager (the super role) can open every page and do every action.
// - Other roles can open a page only if it's granted on /permissions, and
//   can do an action only if it's granted AND its page is granted.
// - `superOnly` pages can never be granted (they control access itself).
// - Any path NOT listed here is Manager-only by default, so a new page stays
//   locked until it's added below.

import { isSuperRoleName } from "@/lib/roles";

export type AppPage = {
  path: string;
  label: string;
  superOnly?: boolean;
};

export const APP_PAGES: AppPage[] = [
  { path: "/", label: "Inventory" },
  { path: "/location-stock", label: "Location Stock (v2)" },
  { path: "/total-stock", label: "Total Stock" },
  { path: "/sales-orders", label: "Sales Orders" },
  { path: "/movement-history-v2", label: "Movement History (v2)" },
  { path: "/work-orders", label: "Work Orders" },
  { path: "/scan", label: "System Control" },
  { path: "/analytics", label: "Analytics" },
  { path: "/stock-opname", label: "Stock Opname" },
  { path: "/other-transactions", label: "Other Transactions" },
  { path: "/items", label: "Items" },
  { path: "/locations", label: "Locations" },
  { path: "/settings", label: "Settings" },
  { path: "/users", label: "Users", superOnly: true },
  { path: "/roles", label: "Roles", superOnly: true },
  { path: "/permissions", label: "Permissions", superOnly: true },
];

// Actions within a page. On the web these are enforced in the UI and in the
// API routes they call. The PDA is not affected by them, except
// `settings.edit` which applies everywhere (settings used to be admin-only).
export type ActionKey =
  | "so.create"
  | "so.edit"
  | "so.tambahan"
  | "locationStock.editOutboundWh"
  | "scan.inbound"
  | "scan.adjustLocation"
  | "scan.adjustBulk"
  | "scan.correctQty"
  | "settings.edit";

export type AppAction = {
  key: ActionKey;
  page: string;
  label: string;
  hint?: string;
};

export const APP_ACTIONS: AppAction[] = [
  { key: "so.create", page: "/sales-orders", label: "Create sales orders" },
  { key: "so.edit", page: "/sales-orders", label: "Edit sales orders" },
  {
    key: "so.tambahan",
    page: "/sales-orders",
    label: "Tambahan actions",
    hint: "Convert to SO, confirm leftover, return stock",
  },
  {
    key: "locationStock.editOutboundWh",
    page: "/location-stock",
    label: "Edit Outbound WH",
    hint: "Correct marked SO / Tambahan quantities",
  },
  { key: "scan.inbound", page: "/scan", label: "Inbound tab" },
  { key: "scan.adjustLocation", page: "/scan", label: "Adjust tab" },
  { key: "scan.adjustBulk", page: "/scan", label: "Bulk Adjust tab" },
  { key: "scan.correctQty", page: "/scan", label: "Correct Qty tab" },
  { key: "settings.edit", page: "/settings", label: "Edit settings", hint: "Including ledger start and translations" },
];

export const GRANTABLE_PAGES = APP_PAGES.filter((p) => !p.superOnly);

const GRANTABLE_PATHS = new Set(GRANTABLE_PAGES.map((p) => p.path));
const ACTIONS_BY_KEY = new Map(APP_ACTIONS.map((a) => [a.key, a]));

export function isGrantablePath(path: string): boolean {
  return GRANTABLE_PATHS.has(path);
}

export function isActionKey(key: string): key is ActionKey {
  return ACTIONS_BY_KEY.has(key as ActionKey);
}

export function getAction(key: ActionKey): AppAction {
  return ACTIONS_BY_KEY.get(key)!;
}

export function actionsForPage(path: string): AppAction[] {
  return APP_ACTIONS.filter((a) => a.page === path);
}

// Kept for existing imports; true only for the super role (Manager).
export const isAdminRoleName = isSuperRoleName;

// Finds the registered page a URL belongs to: "/" matches only itself,
// anything else matches itself and its sub-paths (e.g. /work-orders/123).
// Longest match wins.
export function matchPage(pathname: string): AppPage | undefined {
  let best: AppPage | undefined;
  for (const page of APP_PAGES) {
    const hit =
      page.path === "/"
        ? pathname === "/"
        : pathname === page.path || pathname.startsWith(`${page.path}/`);
    if (hit && (!best || page.path.length > best.path.length)) best = page;
  }
  return best;
}

export type PageAccess = {
  roleName: string;
  isAdmin: boolean; // true for the super role (Manager)
  allowedPages: string[]; // grantable paths only; empty for super (has all)
  allowedActions: ActionKey[]; // only actions whose page is also allowed; empty for super
};

export function canAccessPath(pathname: string, access: PageAccess): boolean {
  if (access.isAdmin) return true;
  const page = matchPage(pathname);
  if (!page || page.superOnly) return false;
  return access.allowedPages.includes(page.path);
}

export function canDo(access: PageAccess | null, key: ActionKey): boolean {
  if (!access) return false;
  if (access.isAdmin) return true;
  return access.allowedActions.includes(key);
}

// Where to send someone after login, or when they open a page they can't use.
export function firstAllowedPath(access: PageAccess): string | null {
  if (access.isAdmin) return "/";
  const first = GRANTABLE_PAGES.find((p) => access.allowedPages.includes(p.path));
  return first?.path ?? null;
}
