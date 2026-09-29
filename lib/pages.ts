// The web pages that page permissions apply to. Safe to import from client
// components (no DB access here).
//
// - Admin can open every page, always.
// - Other roles can open a page only if it's granted on /permissions.
// - `adminOnly` pages can never be granted (they control access itself).
// - Any path NOT listed here is admin-only by default, so a new page stays
//   locked until it's added below.

export type AppPage = {
  path: string;
  label: string;
  adminOnly?: boolean;
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
  { path: "/settings", label: "Settings", adminOnly: true },
  { path: "/users", label: "Users", adminOnly: true },
  { path: "/roles", label: "Roles", adminOnly: true },
  { path: "/permissions", label: "Permissions", adminOnly: true },
];

export const GRANTABLE_PAGES = APP_PAGES.filter((p) => !p.adminOnly);

const GRANTABLE_PATHS = new Set(GRANTABLE_PAGES.map((p) => p.path));

export function isGrantablePath(path: string): boolean {
  return GRANTABLE_PATHS.has(path);
}

export function isAdminRoleName(roleName: string | null | undefined): boolean {
  return roleName?.toLowerCase() === "admin";
}

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
  isAdmin: boolean;
  allowedPages: string[]; // grantable paths only; empty for admin (has all)
};

export function canAccessPath(pathname: string, access: PageAccess): boolean {
  if (access.isAdmin) return true;
  const page = matchPage(pathname);
  if (!page || page.adminOnly) return false;
  return access.allowedPages.includes(page.path);
}

// Where to send someone after login, or when they open a page they can't use.
export function firstAllowedPath(access: PageAccess): string | null {
  if (access.isAdmin) return "/";
  const first = GRANTABLE_PAGES.find((p) => access.allowedPages.includes(p.path));
  return first?.path ?? null;
}
