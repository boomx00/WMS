import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { activeLimit, getPdaRules } from "@/lib/pdaRules";

export const dynamic = "force-dynamic";

// GET /api/settings/pda — the PDA rules a PDA screen needs (Settings → PDA).
// maxPick / maxShip are the maximums in force right now: null unless strict
// mode is on and a maximum is set. Change them with PATCH /api/settings.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const rules = await getPdaRules(db);
  return NextResponse.json({
    pickUnits: rules.pickUnits,
    shipUnits: rules.shipUnits,
    strictMode: rules.strictMode,
    maxPick: activeLimit(rules, "pick"),
    maxShip: activeLimit(rules, "ship"),
    itemLookupFields: rules.itemLookupFields,
  });
}
