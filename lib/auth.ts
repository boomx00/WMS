import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export type SessionPayload = {
  userId: number;
  username: string;
  roleId: number;
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

// Returns the current session's role name (e.g. "Admin"), or null if not
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

export async function requireAdmin() {
  const role = await getSessionRole();
  if (role !== "Admin") {
    return { error: "Admin access required", status: 403 as const };
  }
  return null;
}

export async function hasRole(userId: number, allowedRoleNames: string[]): Promise<boolean> {
  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));

  if (!row?.roleName) return false;

  const normalized = row.roleName.toLowerCase();
  return allowedRoleNames.some((allowed) => allowed.toLowerCase() === normalized);
}