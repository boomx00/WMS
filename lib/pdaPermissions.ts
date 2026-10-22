// Server-only: looks up which PDA features a user may use. Used by PDA
// login, /api/auth/pda-access, and the API routes behind a PDA feature.
// The web-side equivalent is lib/pagePermissions.ts.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, roles, rolePdaPermissions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isSuperRoleName } from "@/lib/roles";
import {
  ALL_PDA_KEYS,
  canDoPda,
  getPdaFeature,
  isPdaKey,
  type PdaAccess,
  type PdaKey,
} from "@/lib/pdaFeatures";
import type { SessionPayload } from "@/lib/auth";

// Reads the role fresh from the DB (not from the session token), so role
// and permission changes apply on the very next request.
// Returns null if the user no longer exists or has been disabled.
export async function getPdaAccess(userId: number): Promise<PdaAccess | null> {
  const [row] = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)));

  if (!row) return null;

  if (isSuperRoleName(row.roleName)) {
    return { roleName: row.roleName, isSuper: true, allowed: [...ALL_PDA_KEYS] };
  }

  const grants = await db
    .select({ pdaKey: rolePdaPermissions.pdaKey })
    .from(rolePdaPermissions)
    .where(eq(rolePdaPermissions.roleId, row.roleId));

  // Ignore stale rows for features that were removed.
  const allowed = grants.map((g) => g.pdaKey).filter(isPdaKey);

  return { roleName: row.roleName, isSuper: false, allowed };
}

// For API routes behind a PDA feature. Returns a 403 response to send back,
// or null if the request may go ahead. Applies to every session (web or
// PDA) — see lib/pdaFeatures.ts.
export async function denyUnlessPdaAllowed(
  session: SessionPayload,
  key: PdaKey
): Promise<NextResponse | null> {
  const access = await getPdaAccess(session.userId);
  if (canDoPda(access, key)) return null;

  return NextResponse.json(
    { error: `Your role doesn't have PDA permission for: ${getPdaFeature(key).label}` },
    { status: 403 }
  );
}