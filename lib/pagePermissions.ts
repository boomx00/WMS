// Server-only: looks up which web pages a user may open. Used by proxy.ts,
// the root layout (to filter the nav) and web login.

import { db } from "@/lib/db";
import { users, roles, rolePagePermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminRoleName, isGrantablePath, type PageAccess } from "@/lib/pages";

// Reads the role fresh from the DB (not from the session token), so role
// changes and permission changes apply on the next page load.
// Returns null if the user no longer exists.
export async function getPageAccess(userId: number): Promise<PageAccess | null> {
  const [row] = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));

  if (!row) return null;

  if (isAdminRoleName(row.roleName)) {
    return { roleName: row.roleName, isAdmin: true, allowedPages: [] };
  }

  const grants = await db
    .select({ pagePath: rolePagePermissions.pagePath })
    .from(rolePagePermissions)
    .where(eq(rolePagePermissions.roleId, row.roleId));

  return {
    roleName: row.roleName,
    isAdmin: false,
    // Ignore stale rows for pages that were removed or made admin-only.
    allowedPages: grants.map((g) => g.pagePath).filter(isGrantablePath),
  };
}
