import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signSession } from "@/lib/auth";
import { getPageAccess } from "@/lib/pagePermissions";
import { firstAllowedPath } from "@/lib/pages";

// POST /api/auth/login
// body: { username, password, client? }
// client: "web" → Admin, or a role with at least one page granted on
// /permissions. Anything else (e.g. the PDA app) keeps the existing behaviour.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, client } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({ user: users, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.username, username));

  if (!row) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const { user, roleName } = row;

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  // Checked after the password so we don't reveal which usernames exist
  // or what role they have to someone who doesn't know the password.
  let homePath: string | null = null;
  if (client === "web") {
    const access = await getPageAccess(user.id);
    homePath = access ? firstAllowedPath(access) : null;
    if (!homePath) {
      return NextResponse.json(
        { error: "Your role has no web access. Please use the PDA." },
        { status: 403 }
      );
    }
  }

  const token = await signSession({
    userId: user.id,
    username: user.username,
    roleId: user.roleId,
    roleName,
  });

  const response = NextResponse.json({
    id: user.id,
    username: user.username,
    roleId: user.roleId,
    // Web only, so the PDA's login response stays exactly as before.
    ...(homePath ? { homePath } : {}),
  });

  response.cookies.set("session", token, {
    httpOnly: true,
    secure: false, // TEMP: revert to `process.env.NODE_ENV === "production"` once HTTPS is actually working
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours, matches JWT expiry
  });

  return response;
}