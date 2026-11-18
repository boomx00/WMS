import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { DEFAULT_LEDGER_START_AT } from "@/lib/ledger";
import { DEFAULT_OFFICE_DAY_START_MINUTES, isValidOfficeDayStart } from "@/lib/officeDay";
import { DEFAULT_STOCK_OPNAME_CYCLE, isValidStockOpnameCycle } from "@/lib/stockOpnameCycle";
import { cleanBasis, cleanLookupFields, cleanMaxQty, cleanUnitLevels } from "@/lib/pdaRules";

const BOOLEAN_KEYS = [
  "allowDefaultCodeTransactions",
  "automaticInbound",
  "automaticInboundFromRack",
  "allowUntrackedOutbound",
  "allowDefaultPicking",
  "allowNegativeFloorStock",
  "allowNegativeRackStock",
  "markingEnabled",
  "operationsFrozen",
  "pdaStrictMode",
] as const;

const DEFAULTS = {
  allowDefaultCodeTransactions: true,
  automaticInbound: false,
  automaticInboundFromRack: false,
  allowUntrackedOutbound: false,
  allowDefaultPicking: true,
  allowNegativeFloorStock: false,
  allowNegativeRackStock: false,
  markingEnabled: true,
  operationsFrozen: false,
  ledgerStartAt: DEFAULT_LEDGER_START_AT,
  officeDayStartMinutes: DEFAULT_OFFICE_DAY_START_MINUTES,
  opnameCycleType: DEFAULT_STOCK_OPNAME_CYCLE.type,
  opnameCycleStartDay: DEFAULT_STOCK_OPNAME_CYCLE.startDay,
  pdaStrictMode: false,
};

export async function GET() {
  const [row] = await db.select().from(settings).limit(1);
  if (!row) return NextResponse.json(DEFAULTS);
  return NextResponse.json({ ...row, ledgerStartAt: row.ledgerStartAt ?? DEFAULT_LEDGER_START_AT });
}

// PATCH /api/settings
// body: any subset of the boolean flags, and/or
// (default receiving / staging locations are per warehouse: PATCH /api/warehouses/:id)
//       ledgerStartAt: ISO string (e.g. "2026-09-20T17:00:00.000Z") or null to reset to default
//       officeDayStartMinutes: 0–1439, minutes after midnight WIB the Dashboard's
//         office day starts (420 = 07:00)
//       opnameCycleType: "WEEKLY" | "MONTHLY", opnameCycleStartDay: 1 (Monday) to 7
//         (Sunday) when weekly, 1 to 31 when monthly
//       Settings → PDA (lib/pdaRules.ts):
//         pdaPickUnits / pdaShipUnits: non-empty subset of ["STORAGE", "PRIMARY"]
//         pdaStrictMode: boolean
//         pdaMaxPickQty / pdaMaxShipQty: whole number from 1, or null for no maximum
//         pdaMaxPickBasis / pdaMaxShipBasis: "STORAGE" | "PRIMARY"
//         itemLookupFields: non-empty subset of ["SKU", "LEGACY_SKU", "BARCODE"]
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Enforced for every client, not just web: settings were admin-only before.
  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return denied;

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

  if (body.officeDayStartMinutes !== undefined) {
    if (!isValidOfficeDayStart(body.officeDayStartMinutes)) {
      return NextResponse.json(
        { error: "officeDayStartMinutes must be a whole number from 0 to 1439" },
        { status: 400 }
      );
    }
    updates.officeDayStartMinutes = body.officeDayStartMinutes;
  }

  if (body.opnameCycleType !== undefined || body.opnameCycleStartDay !== undefined) {
    // Checked together with whichever one isn't being changed.
    const [current] = await db
      .select({ type: settings.opnameCycleType, startDay: settings.opnameCycleStartDay })
      .from(settings)
      .limit(1);
    const type = body.opnameCycleType ?? current?.type ?? DEFAULTS.opnameCycleType;
    const startDay = body.opnameCycleStartDay ?? current?.startDay ?? DEFAULTS.opnameCycleStartDay;
    if (!isValidStockOpnameCycle(type, startDay)) {
      return NextResponse.json(
        { error: "Stock opname cycle must be WEEKLY with a start day from 1 to 7, or MONTHLY with one from 1 to 31" },
        { status: 400 }
      );
    }
    updates.opnameCycleType = type;
    updates.opnameCycleStartDay = startDay;
  }

  for (const key of ["pdaPickUnits", "pdaShipUnits"] as const) {
    if (body[key] !== undefined) {
      const levels = cleanUnitLevels(body[key]);
      if (!levels) {
        return NextResponse.json({ error: "Choose at least one unit for the PDA to offer" }, { status: 400 });
      }
      updates[key] = levels;
    }
  }

  for (const key of ["pdaMaxPickQty", "pdaMaxShipQty"] as const) {
    if (body[key] !== undefined) {
      const qty = cleanMaxQty(body[key]);
      if (qty === undefined) {
        return NextResponse.json({ error: "A maximum must be a whole number from 1, or empty for none" }, { status: 400 });
      }
      updates[key] = qty;
    }
  }

  for (const key of ["pdaMaxPickBasis", "pdaMaxShipBasis"] as const) {
    if (body[key] !== undefined) {
      const basis = cleanBasis(body[key]);
      if (!basis) {
        return NextResponse.json({ error: `${key} must be STORAGE or PRIMARY` }, { status: 400 });
      }
      updates[key] = basis;
    }
  }

  if (body.itemLookupFields !== undefined) {
    const fields = cleanLookupFields(body.itemLookupFields);
    if (!fields) {
      return NextResponse.json({ error: "Choose at least one field a product code is matched against" }, { status: 400 });
    }
    updates.itemLookupFields = fields;
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
