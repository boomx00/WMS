import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/db/schema";
import { getSession, isSuperUser } from "@/lib/auth";
import { cleanAttribute } from "@/lib/itemTags";
import { getSuppliers, isSupplierKind } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

// GET /api/suppliers — every supplier: [{ id, name, kind }]
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await getSuppliers(db));
}

// POST /api/suppliers — Manager only.
// body: { name, kind: "PRODUCTION" | "EXTERNAL" }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can add suppliers" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = cleanAttribute(body.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const kind = isSupplierKind(body.kind) ? body.kind : "EXTERNAL";

  const [created] = await db
    .insert(suppliers)
    .values({ name, kind, createdBy: session.userId })
    .onConflictDoNothing()
    .returning({ id: suppliers.id, name: suppliers.name, kind: suppliers.kind });
  if (!created) {
    return NextResponse.json({ error: `There is already a supplier called "${name}"` }, { status: 409 });
  }
  return NextResponse.json(created, { status: 201 });
}
