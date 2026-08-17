import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameLocations, stockOpnameItems, locations, users } from "@/db/schema";
import { eq, inArray, desc, sql, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

async function resolveLocationCodes(rawTokens: string[]): Promise<number[]> {
  const areaLetters: string[] = [];
  const exactCodes: string[] = [];

  for (const raw of rawTokens) {
    const token = raw.trim();
    if (!token) continue;
    const areaMatch = token.match(/^(?:rack\s+)?([a-h])$/i);
    if (areaMatch) {
      areaLetters.push(areaMatch[1].toUpperCase());
    } else {
      exactCodes.push(token);
    }
  }

  const idSet = new Set<number>();

  if (areaLetters.length > 0) {
    const areaLocs = await db
      .select({ id: locations.id })
      .from(locations)
      .where(or(...areaLetters.map((a) => sql`${locations.type} = 'RACK' AND ${locations.area} = ${a}`)));
    areaLocs.forEach((l) => idSet.add(l.id));
  }

  if (exactCodes.length > 0) {
    const exactLocs = await db.select({ id: locations.id }).from(locations).where(inArray(locations.code, exactCodes));
    exactLocs.forEach((l) => idSet.add(l.id));
  }

  return Array.from(idSet);
}

// POST /api/stock-opname
// body: { opnameNumber, notes?, locationCodes?: string[], assignedToUsername? }
// This initial version is a BLIND count — it does not snapshot or cross
// check against current location_stock. It only records WHICH cells need
// visiting; the PIC's scans are the sole source of what gets recorded.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const opnameNumber = sanitize(body.opnameNumber ?? "");
  const notes = sanitize(body.notes ?? "");
  const assignedToUsername = sanitize(body.assignedToUsername ?? "");
  const locationCodes: string[] = Array.isArray(body.locationCodes) ? body.locationCodes : [];

  if (!opnameNumber) {
    return NextResponse.json({ error: "opnameNumber is required" }, { status: 400 });
  }

  const [existing] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (existing) {
    return NextResponse.json({ error: "This opname number already exists" }, { status: 409 });
  }

  let assignedTo: number | null = null;
  if (assignedToUsername) {
    const [assignee] = await db.select().from(users).where(eq(users.username, assignedToUsername));
    if (!assignee) {
      return NextResponse.json({ error: "Unknown username for assignment" }, { status: 404 });
    }
    assignedTo = assignee.id;
  }

  let locationIds: number[];
  if (locationCodes.length > 0) {
    locationIds = await resolveLocationCodes(locationCodes);
    if (locationIds.length === 0) {
      return NextResponse.json({ error: "No locations matched the given codes/areas" }, { status: 400 });
    }
  } else {
    const allLocs = await db.select({ id: locations.id }).from(locations);
    locationIds = allLocs.map((l) => l.id);
  }

  const result = await db.transaction(async (tx) => {
    const [opname] = await tx
      .insert(stockOpname)
      .values({
        opnameNumber,
        notes: notes || null,
        createdBy: session.userId,
        assignedTo,
      })
      .returning();

    await tx.insert(stockOpnameLocations).values(
      locationIds.map((locationId) => ({ opnameNumber, locationId }))
    );

    return opname;
  });

  return NextResponse.json({ ...result, locationCount: locationIds.length }, { status: 201 });
}

// GET /api/stock-opname — web admin overview, including the full
// PIC/location/SKU/qty report per session.
export async function GET() {
  const sessions = await db.select().from(stockOpname).orderBy(desc(stockOpname.createdAt));

  const locationRows = await db
    .select({
      opnameNumber: stockOpnameLocations.opnameNumber,
      total: sql<number>`count(*)::int`,
    })
    .from(stockOpnameLocations)
    .groupBy(stockOpnameLocations.opnameNumber);

  const countedRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      counted: sql<number>`count(distinct ${stockOpnameItems.locationId})::int`,
    })
    .from(stockOpnameItems)
    .groupBy(stockOpnameItems.opnameNumber);

  const totalMap = new Map(locationRows.map((r) => [r.opnameNumber, r.total]));
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.counted]));

  const assigneeRows = await db.select().from(users);
  const usersById = new Map(assigneeRows.map((u) => [u.id, u.username]));

  const result = sessions.map((s) => {
    const total = totalMap.get(s.opnameNumber) ?? 0;
    const counted = countedMap.get(s.opnameNumber) ?? 0;
    const status = total === 0 || counted === 0 ? "PENDING" : counted >= total ? "DONE" : "IN_PROGRESS";
    return {
      ...s,
      assignedToUsername: s.assignedTo ? usersById.get(s.assignedTo) ?? null : null,
      totalLines: total,
      countedLines: counted,
      discrepancies: 0, // not tracked in this simplified version
      status,
    };
  });

  return NextResponse.json(result);
}