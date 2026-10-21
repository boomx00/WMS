import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPdaAccess } from "@/lib/pdaPermissions";

export const dynamic = "force-dynamic";

// GET /api/auth/pda-access
// The current user's PDA features, read fresh from the DB. The PDA calls
// this when its home screen opens, so permission changes made on
// /permissions show up without logging out.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const access = await getPdaAccess(session.userId);
  if (!access) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  return NextResponse.json({ pdaPermissions: access.allowed });
}
