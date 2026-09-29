import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSuperRoleName } from "@/lib/roles";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export type SessionPayload = {
  userId: number;
  username: string;
  roleId: number;
  // Added so middleware (which can't query the DB) can gate web pages.
  // Optional so older tokens / other callers of signSession still type-check.
  roleName?: string;
  // "web" for web-app logins. Absent for the PDA. Action permissions are
  // only enforced for web sessions, so the PDA keeps working unchanged.
  client?: "web";
};

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h") // matches a typical warehouse shift
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) return null;

  return verifySession(token);
}

// Returns the current session's role name (e.g. "Manager"), or null if not
// logged in / role can't be resolved.
export async function getSessionRole(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, session.userId));

  return row?.roleName ?? null;
}

// Whether this user has the super role (Manager).
export async function isSuperUser(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));

  return isSuperRoleName(row?.roleName);
}

// Whether the current request's user has the super role.
export async function sessionIsSuper(): Promise<boolean> {
  const session = await getSession();
  return session ? isSuperUser(session.userId) : false;
}

// Name kept for existing callers: requires the super role (Manager).
export async function requireAdmin() {
  const role = await getSessionRole();
  if (!isSuperRoleName(role)) {
    return { error: "Manager access required", status: 403 as const };
  }
  return null;
}

// Pass SUPER_ROLE_NAME in `allowedRoleNames` to allow Manager.
export async function hasRole(userId: number, allowedRoleNames: string[]): Promise<boolean> {
  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));

  if (!row?.roleName) return false;

  if (isSuperRoleName(row.roleName) && allowedRoleNames.some(isSuperRoleName)) return true;

  const normalized = row.roleName.toLowerCase();
  return allowedRoleNames.some((allowed) => allowed.toLowerCase() === normalized);
}
