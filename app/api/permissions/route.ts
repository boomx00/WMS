import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roles, rolePagePermissions, roleActionPermissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { isSuperRoleName } from "@/lib/roles";
import { APP_ACTIONS, GRANTABLE_PAGES, isActionKey, isGrantablePath } from "@/lib/pages";

export const dynamic = "force-dynamic";

// GET /api/permissions — roles, grantable pages/actions, and current grants.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const [roleRows, pageRows, actionRows] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db
      .select({ roleId: rolePagePermissions.roleId, pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions),
    db
      .select({ roleId: roleActionPermissions.roleId, actionKey: roleActionPermissions.actionKey })
      .from(roleActionPermissions),
  ]);

  return NextResponse.json({
    roles: roleRows.map((r) => ({ id: r.id, name: r.name, isSuper: isSuperRoleName(r.name) })),
    pages: GRANTABLE_PAGES,
    actions: APP_ACTIONS,
    pageGrants: pageRows.filter((g) => isGrantablePath(g.pagePath)),
    actionGrants: actionRows.filter((g) => isActionKey(g.actionKey)),
  });
}

// PATCH /api/permissions
// body: { roleId, pagePath, allowed }   — grant/revoke a page
//    or { roleId, actionKey, allowed }  — grant/revoke an action
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await req.json();
  const roleId = Number(body.roleId);
  const allowed = body.allowed;
  const pagePath = body.pagePath === undefined ? null : String(body.pagePath);
  const actionKey = body.actionKey === undefined ? null : String(body.actionKey);

  if (!Number.isInteger(roleId) || typeof allowed !== "boolean") {
    return NextResponse.json({ error: "roleId and allowed are required" }, { status: 400 });
  }
  if ((pagePath === null) === (actionKey === null)) {
    return NextResponse.json({ error: "Send exactly one of pagePath or actionKey" }, { status: 400 });
  }
  if (pagePath !== null && !isGrantablePath(pagePath)) {
    return NextResponse.json({ error: "That page can't be granted" }, { status: 400 });
  }
  if (actionKey !== null && !isActionKey(actionKey)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 404 });
  }
  if (isSuperRoleName(role.name)) {
    return NextResponse.json({ error: `${role.name} always has every permission` }, { status: 400 });
  }

  if (pagePath !== null) {
    if (allowed) {
      await db.insert(rolePagePermissions).values({ roleId, pagePath }).onConflictDoNothing();
    } else {
      await db
        .delete(rolePagePermissions)
        .where(and(eq(rolePagePermissions.roleId, roleId), eq(rolePagePermissions.pagePath, pagePath)));
    }
  } else if (actionKey !== null) {
    if (allowed) {
      await db.insert(roleActionPermissions).values({ roleId, actionKey }).onConflictDoNothing();
    } else {
      await db
        .delete(roleActionPermissions)
        .where(and(eq(roleActionPermissions.roleId, roleId), eq(roleActionPermissions.actionKey, actionKey)));
    }
  }

  return NextResponse.json({ roleId, pagePath, actionKey, allowed });
}
