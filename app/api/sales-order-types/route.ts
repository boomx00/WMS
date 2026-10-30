import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrderTypes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  cleanNumberPrefix,
  cleanTypeDescription,
  cleanTypeName,
  listSalesOrderTypesWithCounts,
  typeNameTaken,
} from "@/lib/salesOrderTypes";

export const dynamic = "force-dynamic";

// GET /api/sales-order-types — every type, by name, with how many sales
// orders use it: [{ id, name, description, numberPrefix, orderCount }]
// Any logged-in user (the create-SO form and Analytics read it).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await listSalesOrderTypesWithCounts(db));
}

// POST /api/sales-order-types
// body: { name, description?, numberPrefix? }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "so.types");
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = cleanTypeName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (await typeNameTaken(db, name)) {
    return NextResponse.json({ error: `There is already a type called "${name}"` }, { status: 409 });
  }

  const [created] = await db
    .insert(salesOrderTypes)
    .values({
      name,
      description: cleanTypeDescription(body?.description),
      numberPrefix: cleanNumberPrefix(body?.numberPrefix),
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    return NextResponse.json({ error: `There is already a type called "${name}"` }, { status: 409 });
  }

  return NextResponse.json(created, { status: 201 });
}
