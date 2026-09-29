import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession, requireAdmin } from "@/lib/auth";
import { DEFAULT_LEDGER_START_AT } from "@/lib/ledger";

const BOOLEAN_KEYS = [
  "allowDefaultCodeTransactions",
  "automaticInbound",
  "automaticInboundFromRack",
  "allowUntrackedOutbound",
  "allowDefaultPicking",
  "allowNegativeFloorStock",
  "allowNegativeRackStock",
] as const;

const DEFAULTS = {
  allowDefaultCodeTransactions: true,
  automaticInbound: false,
  automaticInboundFromRack: false,
  allowUntrackedOutbound: false,
  allowDefaultPicking: true,
  allowNegativeFloorStock: false,
  allowNegativeRackStock: false,
  ledgerStartAt: DEFAULT_LEDGER_START_AT,
};

export async function GET() {
  const [row] = await db.select().from(settings).limit(1);
  if (!row) return NextResponse.json(DEFAULTS);
  return NextResponse.json({ ...row, ledgerStartAt: row.ledgerStartAt ?? DEFAULT_LEDGER_START_AT });
}

// PATCH /api/settings
// body: any subset of the boolean flags, and/or
//       ledgerStartAt: ISO string (e.g. "2026-09-20T17:00:00.000Z") or null to reset to default
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await requireAdmin();
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await req.json();

  const updates: Partial<typeof settings.$inferInsert> = {};
  for (const key of BOOLEAN_KEYS) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") {
        return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 });
      }
      updates[key] = body[key];
    }
  }

  if (body.ledgerStartAt !== undefined) {
    if (body.ledgerStartAt === null) {
      updates.ledgerStartAt = null;
    } else {
      const parsed = new Date(body.ledgerStartAt);
      if (typeof body.ledgerStartAt !== "string" || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "ledgerStartAt must be a valid date" }, { status: 400 });
      }
      if (parsed.getTime() > Date.now()) {
        return NextResponse.json({ error: "Ledger start can't be in the future" }, { status: 400 });
      }
      updates.ledgerStartAt = parsed;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No recognized settings fields in request body" }, { status: 400 });
  }

  const [existing] = await db.select().from(settings).limit(1);

  let result;
  if (existing) {
    [result] = await db
      .update(settings)
      .set(updates)
      .where(eq(settings.id, existing.id))
      .returning();
  } else {
    [result] = await db
      .insert(settings)
      .values({ ...DEFAULTS, ...updates })
      .returning();
  }

  return NextResponse.json({ ...result, ledgerStartAt: result.ledgerStartAt ?? DEFAULT_LEDGER_START_AT });
}
