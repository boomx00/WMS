import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roles, rolePagePermissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { GRANTABLE_PAGES, isAdminRoleName, isGrantablePath } from "@/lib/pages";

export const dynamic = "force-dynamic";

// GET /api/permissions — roles, grantable pages, and current grants.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const [roleRows, grantRows] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db
      .select({ roleId: rolePagePermissions.roleId, pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions),
  ]);

  return NextResponse.json({
    roles: roleRows.map((r) => ({ id: r.id, name: r.name, isAdmin: isAdminRoleName(r.name) })),
    pages: GRANTABLE_PAGES,
    grants: grantRows.filter((g) => isGrantablePath(g.pagePath)),
  });
}

// PATCH /api/permissions
// body: { roleId: number, pagePath: string, allowed: boolean }
export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await req.json();
  const roleId = Number(body.roleId);
  const pagePath = String(body.pagePath ?? "");
  const allowed = body.allowed;

  if (!Number.isInteger(roleId) || typeof allowed !== "boolean") {
    return NextResponse.json({ error: "roleId and allowed are required" }, { status: 400 });
  }
  if (!isGrantablePath(pagePath)) {
    return NextResponse.json({ error: "That page can't be granted" }, { status: 400 });
  }

  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 404 });
  }
  if (isAdminRoleName(role.name)) {
    return NextResponse.json({ error: "Admin always has access to every page" }, { status: 400 });
  }

  if (allowed) {
    await db.insert(rolePagePermissions).values({ roleId, pagePath }).onConflictDoNothing();
  } else {
    await db
      .delete(rolePagePermissions)
      .where(and(eq(rolePagePermissions.roleId, roleId), eq(rolePagePermissions.pagePath, pagePath)));
  }

  return NextResponse.json({ roleId, pagePath, allowed });
}
