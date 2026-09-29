// Server-only: looks up which web pages and actions a user may use. Used by
// proxy.ts, the root layout, web login, and API routes behind an action.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles, rolePagePermissions, roleActionPermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSuperRoleName } from "@/lib/roles";
import {
  canDo,
  getAction,
  isActionKey,
  isGrantablePath,
  type ActionKey,
  type PageAccess,
} from "@/lib/pages";
import type { SessionPayload } from "@/lib/auth";

// Reads the role fresh from the DB (not from the session token), so role
// changes and permission changes apply on the next request.
// Returns null if the user no longer exists.
export async function getPageAccess(userId: number): Promise<PageAccess | null> {
  const [row] = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));

  if (!row) return null;

  if (isSuperRoleName(row.roleName)) {
    return { roleName: row.roleName, isAdmin: true, allowedPages: [], allowedActions: [] };
  }

  const [pageGrants, actionGrants] = await Promise.all([
    db
      .select({ pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions)
      .where(eq(rolePagePermissions.roleId, row.roleId)),
    db
      .select({ actionKey: roleActionPermissions.actionKey })
      .from(roleActionPermissions)
      .where(eq(roleActionPermissions.roleId, row.roleId)),
  ]);

  // Ignore stale rows for pages/actions that were removed or made super-only.
  const allowedPages = pageGrants.map((g) => g.pagePath).filter(isGrantablePath);
  const allowedActions = actionGrants
    .map((g) => g.actionKey)
    .filter(isActionKey)
    // An action is useless without its page, so it doesn't count alone.
    .filter((key) => allowedPages.includes(getAction(key).page));

  return { roleName: row.roleName, isAdmin: false, allowedPages, allowedActions };
}

// For API routes behind an action. Returns a 403 response to send back, or
// null if the request may go ahead.
//
// webOnly (default true): only web sessions are checked, so the PDA keeps
// working exactly as before for every role. Pass false for things that were
// already restricted everywhere (e.g. settings).
export async function denyUnlessAllowed(
  session: SessionPayload,
  key: ActionKey,
  { webOnly = true }: { webOnly?: boolean } = {}
): Promise<NextResponse | null> {
  if (webOnly && session.client !== "web") return null;

  const access = await getPageAccess(session.userId);
  if (canDo(access, key)) return null;

  return NextResponse.json(
    { error: `Your role doesn't have permission for: ${getAction(key).label}` },
    { status: 403 }
  );
}
