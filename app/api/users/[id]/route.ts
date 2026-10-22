import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getSession, hasRole, signSession } from "@/lib/auth";
import { SUPER_ROLE_NAME } from "@/lib/roles";

// PATCH /api/users/:id
// body: { username?, password?, disabled? } — send only what changes.
// password: a new password; omit or send "" to keep the current one.
// disabled: true disables the account (can't log in, existing sessions stop
// working), false re-enables it. Role changes stay on /api/users/:id/role.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await hasRole(session.userId, [SUPER_ROLE_NAME]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only Manager can edit users" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const body = await req.json();
  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.username !== undefined) {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!username) {
      return NextResponse.json({ error: "Username can't be empty" }, { status: 400 });
    }

    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, userId)));
    if (taken) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }

    updates.username = username;
  }

  if (body.password !== undefined && body.password !== "") {
    if (typeof body.password !== "string") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    updates.passwordHash = await bcrypt.hash(body.password, 10);
  }

  if (body.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") {
      return NextResponse.json({ error: "disabled must be true or false" }, { status: 400 });
    }
    // Also guarantees there's always at least one active Manager: only an
    // active Manager can get here, and they can't disable themselves.
    if (body.disabled && userId === session.userId) {
      return NextResponse.json({ error: "You can't disable your own account" }, { status: 400 });
    }
    updates.disabledAt = body.disabled ? new Date() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  let updated: typeof users.$inferSelect | undefined;
  try {
    [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  } catch (err) {
    // Two edits racing for the same username — the unique index catches it.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
    throw err;
  }

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { passwordHash: _, ...safe } = updated;
  const response = NextResponse.json(safe);

  // Renaming yourself: re-issue your session so the sidebar shows the new
  // name now instead of after your next login.
  if (userId === session.userId && updates.username) {
    const [role] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, updated.roleId));

    const token = await signSession({
      userId: updated.id,
      username: updated.username,
      roleId: updated.roleId,
      roleName: role?.name,
      ...(session.client === "web" ? { client: "web" as const } : {}),
    });

    // Same cookie settings as app/api/auth/login/route.ts — keep in sync.
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: false, // TEMP: revert to `process.env.NODE_ENV === "production"` once HTTPS is actually working
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  return response;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}