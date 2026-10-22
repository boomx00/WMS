import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signSession } from "@/lib/auth";
import { getPageAccess } from "@/lib/pagePermissions";
import { getPdaAccess } from "@/lib/pdaPermissions";
import { firstAllowedPath } from "@/lib/pages";

// POST /api/auth/login
// body: { username, password, client? }
// client: "web" → Manager, or a role with at least one page granted on
// /permissions (Web app tab).
// Anything else is the PDA → Manager, or a role with at least one feature
// granted on /permissions (PDA tab). The response then carries
// `pdaPermissions` so the PDA can hide menus the role can't use.
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

  // After the password check, like the role checks below, so this doesn't
  // reveal which usernames exist.
  if (user.disabledAt) {
    return NextResponse.json(
      { error: "This account has been disabled. Ask a Manager to re-enable it." },
      { status: 403 }
    );
  }

  // Checked after the password so we don't reveal which usernames exist
  // or what role they have to someone who doesn't know the password.
  let homePath: string | null = null;
  let pdaPermissions: string[] | null = null;
  if (client === "web") {
    const access = await getPageAccess(user.id);
    homePath = access ? firstAllowedPath(access) : null;
    if (!homePath) {
      return NextResponse.json(
        { error: "Your role has no web access. Please use the PDA." },
        { status: 403 }
      );
    }
  } else {
    const access = await getPdaAccess(user.id);
    pdaPermissions = access?.allowed ?? [];
    if (pdaPermissions.length === 0) {
      return NextResponse.json(
        { error: "Your role has no PDA access. Ask a Manager to set it on Permissions." },
        { status: 403 }
      );
    }
  }

  const token = await signSession({
    userId: user.id,
    username: user.username,
    roleId: user.roleId,
    roleName,
    // Marks web sessions so web-only action permissions apply to them.
    ...(client === "web" ? { client: "web" as const } : {}),
  });

  const response = NextResponse.json({
    id: user.id,
    username: user.username,
    roleId: user.roleId,
    // Web only.
    ...(homePath ? { homePath } : {}),
    // PDA only. Older PDA builds ignore it.
    ...(pdaPermissions ? { pdaPermissions } : {}),
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