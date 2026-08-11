import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations, items, settings } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// PATCH /api/pallets/remove
// body: { label, locationCode, quantity? }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const label = await normalizeLabel(db, sanitize(body.label ?? ""));
  const locationCode = sanitize(body.locationCode ?? "");
  const { quantity } = body;

  if (!label || !locationCode) {
    return NextResponse.json({ error: "label and locationCode are required" }, { status: 400 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  // 1. Exact match.
  const [exactPallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.locationId, location.id)));

  if (exactPallet) {
    if (exactPallet.status === "OUTBOUND") {
      return NextResponse.json({ error: "Pallet has already been removed" }, { status: 409 });
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(pallets)
        .set({
          status: "OUTBOUND",
          outForkliftUserId: session.userId,
          removedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pallets.id, exactPallet.id))
        .returning();

      await tx.insert(palletEvents).values({
        palletId: updated.id,
        type: "OUTBOUND",
        locationId: location.id,
        userId: session.userId,
        quantity: exactPallet.quantity,
      });

      return updated;
    });

    return NextResponse.json({ ...result, matchType: "exact" });
  }

  const [alreadyExistsElsewhere] = await db
    .select({ label: pallets.label, locationCode: locations.code })
    .from(pallets)
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(and(eq(pallets.label, label), eq(pallets.status, "ACTIVE")));

  if (alreadyExistsElsewhere) {
    return NextResponse.json(
      {
        error: `This pallet is at ${alreadyExistsElsewhere.locationCode}, not ${locationCode}.`,
        matchType: "already_exists_elsewhere",
        actualLocationCode: alreadyExistsElsewhere.locationCode,
      },
      { status: 409 }
    );
  }

  // 2. Fall back to the default-code bucket.
  const sku = extractSku(label);
  const [item] = sku
    ? await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)))
    : [];

  if (item) {
    const [defaultPallet] = await db
      .select()
      .from(pallets)
      .where(
        and(
          eq(pallets.label, item.defaultCode),
          eq(pallets.locationId, location.id),
          eq(pallets.status, "ACTIVE")
        )
      );

    if (defaultPallet) {
      if (!quantity || quantity <= 0) {
        return NextResponse.json(
          {
            error: "This is default stock, not an individually tracked pallet. Enter the quantity to remove.",
            matchType: "default_needs_quantity",
            availableQuantity: defaultPallet.quantity,
          },
          { status: 400 }
        );
      }

      if (quantity > defaultPallet.quantity) {
        return NextResponse.json(
          { error: `Only ${defaultPallet.quantity} units available at this location` },
          { status: 400 }
        );
      }

      const result = await db.transaction(async (tx) => {
        const remaining = defaultPallet.quantity - quantity;

        const [updated] = await tx
          .update(pallets)
          .set({
            quantity: remaining,
            status: remaining === 0 ? "OUTBOUND" : "ACTIVE",
            outForkliftUserId: remaining === 0 ? session.userId : defaultPallet.outForkliftUserId,
            removedAt: remaining === 0 ? new Date() : defaultPallet.removedAt,
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, defaultPallet.id))
          .returning();

        await tx.insert(palletEvents).values({
          palletId: updated.id,
          type: "OUTBOUND",
          locationId: location.id,
          userId: session.userId,
          quantity,
        });

        return updated;
      });

      return NextResponse.json({ ...result, matchType: "default_fallback", quantityRemoved: quantity });
    }
  }

  // 3. Nothing at all — untracked outbound fallback.
  const [settingsRow] = await db.select().from(settings).limit(1);

  if (settingsRow?.allowUntrackedOutbound) {
    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        {
          error: "This cell has no tracked stock. Enter the quantity to log this outbound (no stock will be reduced).",
          matchType: "untracked_outbound_needs_quantity",
        },
        { status: 400 }
      );
    }

    const [itemForRecord] = sku
      ? await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)))
      : [];

    if (!itemForRecord) {
      return NextResponse.json({ error: "Unknown SKU in scanned label" }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      const [newPallet] = await tx
        .insert(pallets)
        .values({
          label,
          itemId: itemForRecord.id,
          workOrderNumber: "UNTRACKED",
          quantity,
          locationId: location.id,
          status: "OUTBOUND",
          inboundUserId: session.userId,
          outForkliftUserId: session.userId,
          removedAt: new Date(),
        })
        .returning();

      await tx.insert(palletEvents).values({
        palletId: newPallet.id,
        type: "DEFAULT_OUTBOUND",
        locationId: location.id,
        userId: session.userId,
        quantity,
      });

      return newPallet;
    });

    return NextResponse.json(
      { ...result, matchType: "untracked_outbound", quantityRemoved: quantity },
      { status: 201 }
    );
  }

  return NextResponse.json(
    { error: "No exact pallet and no default stock found for this item at that location" },
    { status: 404 }
  );
}