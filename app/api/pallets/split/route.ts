import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations } from "@/db/schema";
import { eq, like, desc, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/pallets/split
// body: { label, splitQuantity, newLocationCode }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const label = await normalizeLabel(db, sanitize(body.label ?? ""));
  const newLocationCode = sanitize(body.newLocationCode ?? "");
  const { splitQuantity } = body;

  if (!label || !splitQuantity || !newLocationCode) {
    return NextResponse.json(
      { error: "label, splitQuantity, and newLocationCode are required" },
      { status: 400 }
    );
  }

  const matches = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.status, "ACTIVE")));

  let pallet;
  if (matches.length === 0) {
    const anyMatches = await db.select().from(pallets).where(eq(pallets.label, label));
    if (anyMatches.length === 0) {
      return NextResponse.json({ error: "Pallet not found" }, { status: 404 });
    }
    if (anyMatches.length > 1) {
      return NextResponse.json(
        {
          error:
            "Multiple pallets share this label across different locations. Use Remove or Move (which require scanning the current location) to disambiguate.",
        },
        { status: 409 }
      );
    }
    pallet = anyMatches[0];
  } else if (matches.length > 1) {
    return NextResponse.json(
      {
        error:
          "Multiple pallets share this label across different locations. Use Remove or Move (which require scanning the current location) to disambiguate.",
      },
      { status: 409 }
    );
  } else {
    pallet = matches[0];
  }

  const isCorrectingActivePallet = pallet.status === "ACTIVE";

  if (isCorrectingActivePallet && splitQuantity >= pallet.quantity) {
    return NextResponse.json(
      {
        error: `splitQuantity must be less than ${pallet.quantity} (use Remove or Move instead for the full quantity)`,
      },
      { status: 400 }
    );
  }

  if (splitQuantity <= 0) {
    return NextResponse.json({ error: "splitQuantity must be positive" }, { status: 400 });
  }

  const [newLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, newLocationCode));

  if (!newLocation) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const existingSplits = await db
    .select()
    .from(pallets)
    .where(like(pallets.label, `${pallet.label}-SPLIT-%`))
    .orderBy(desc(pallets.label));

  const nextSplitNumber = existingSplits.length + 1;
  const newLabel = `${pallet.label}-SPLIT-${nextSplitNumber}`;

  const result = await db.transaction(async (tx) => {
    let updatedOriginal = pallet;

    if (isCorrectingActivePallet) {
      const [updated] = await tx
        .update(pallets)
        .set({
          quantity: pallet.quantity - splitQuantity,
          updatedAt: new Date(),
        })
        .where(eq(pallets.id, pallet.id))
        .returning();
      updatedOriginal = updated;
    }

    const [newPallet] = await tx
      .insert(pallets)
      .values({
        label: newLabel,
        itemId: pallet.itemId,
        workOrderNumber: pallet.workOrderNumber,
        quantity: splitQuantity,
        locationId: newLocation.id,
        status: "PENDING",
        splitFromPalletId: pallet.id,
        inboundUserId: session.userId,
      })
      .returning();

    await tx.insert(palletEvents).values([
      {
        palletId: newPallet.id,
        type: "SPLIT",
        locationId: newLocation.id,
        userId: session.userId,
        quantity: splitQuantity,
      },
      ...(isCorrectingActivePallet
        ? [
            {
              palletId: updatedOriginal.id,
              type: "SPLIT" as const,
              locationId: pallet.locationId,
              userId: session.userId,
              quantity: splitQuantity,
            },
          ]
        : []),
    ]);

    return { original: updatedOriginal, split: newPallet, wasPostShipmentReturn: !isCorrectingActivePallet };
  });

  return NextResponse.json(result, { status: 201 });
}