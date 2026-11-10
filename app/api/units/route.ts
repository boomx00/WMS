import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { units } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { getUnits } from "@/lib/units";
import { cleanName, cleanUnitCode, MAX_UNIT_DECIMALS } from "@/lib/uom";

export const dynamic = "force-dynamic";

// GET /api/units — every unit of measure, in display order:
// [{ id, code, name, nameId, nameZh, decimals, sortOrder, categoryCount }]
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await getUnits(db));
}

// POST /api/units — Manager only.
// body: { code, name, nameId?, nameZh?, decimals? (0–3) }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can add units" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const code = cleanUnitCode(body.code);
  const name = cleanName(body.name);
  if (!code || !name) {
    return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
  }
  const decimals = body.decimals === undefined || body.decimals === "" ? 0 : Number(body.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_UNIT_DECIMALS) {
    return NextResponse.json({ error: `Decimals must be a whole number from 0 to ${MAX_UNIT_DECIMALS}` }, { status: 400 });
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${units.sortOrder}), 0)::int + 1` })
    .from(units);

  const [created] = await db
    .insert(units)
    .values({
      code,
      name,
      nameId: cleanName(body.nameId),
      nameZh: cleanName(body.nameZh),
      decimals,
      sortOrder: next,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    return NextResponse.json({ error: `There is already a unit with code "${code}"` }, { status: 409 });
  }
  return NextResponse.json(created, { status: 201 });
}
