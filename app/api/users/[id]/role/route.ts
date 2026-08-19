import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

// PATCH /api/users/:id/role
// body: { roleId }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await hasRole(session.userId, ["Admin"]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);

  const body = await req.json();
  const { roleId } = body;

  if (roleId === undefined) {
    return NextResponse.json({ error: "roleId is required" }, { status: 400 });
  }

  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 404 });
  }

  const [updated] = await db
    .update(users)
    .set({ roleId })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ...updated, roleName: role.name });
}