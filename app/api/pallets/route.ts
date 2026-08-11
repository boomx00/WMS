import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations, items } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/pallets - list all pallets (current state)
export async function GET() {
  const rows = await db.select().from(pallets);
  return NextResponse.json(rows);
}

// POST /api/pallets - INBOUND scan: create a new pallet at Floor
// body: { label, sku, workOrderNumber, quantity }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const rawLabel = sanitize(body.label ?? "");
  const rawSku = sanitize(body.sku ?? "");
  const workOrderNumber = sanitize(body.workOrderNumber ?? "");
  const { quantity } = body;

  if (!rawLabel || !rawSku || !workOrderNumber || !quantity) {
    return NextResponse.json(
      { error: "label, sku, workOrderNumber, and quantity are required" },
      { status: 400 }
    );
  }

  const label = await normalizeLabel(db, rawLabel);

  // Resolve the item by current sku OR legacy sku, so old printed barcodes
  // still correctly identify the right product.
  const [item] = await db
    .select()
    .from(items)
    .where(or(eq(items.sku, rawSku), eq(items.legacySku, rawSku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  // Check if this exact (normalized) label already exists anywhere as an
  // active pallet — prevents accidentally double-inbounding the same
  // physical pallet.
  const [existingElsewhere] = await db
    .select({
      label: pallets.label,
      locationCode: locations.code,
    })
    .from(pallets)
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(and(eq(pallets.label, label), eq(pallets.status, "ACTIVE")));

  if (existingElsewhere) {
    return NextResponse.json(
      {
        error: `This pallet has already been inbounded — it's currently at ${existingElsewhere.locationCode}.`,
        matchType: "already_exists_elsewhere",
        actualLocationCode: existingElsewhere.locationCode,
      },
      { status: 409 }
    );
  }

  const [floor] = await db
    .select()
    .from(locations)
    .where(eq(locations.type, "FLOOR"));
  if (!floor) {
    return NextResponse.json(
      { error: "No FLOOR location exists yet — create one first" },
      { status: 500 }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [pallet] = await tx
      .insert(pallets)
      .values({
        label,
        itemId: item.id,
        workOrderNumber,
        quantity,
        locationId: floor.id,
        inboundUserId: session.userId,
      })
      .returning();

    await tx.insert(palletEvents).values({
      palletId: pallet.id,
      type: "INBOUND",
      locationId: floor.id,
      userId: session.userId,
      quantity,
    });

    return pallet;
  });

  return NextResponse.json(result, { status: 201 });
}