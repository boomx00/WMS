import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations, items, settings } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";
import { checkRackSkuConflict } from "@/lib/rackGuard";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function parseRealLabel(raw: string) {
  const cleaned = raw.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  if (parts.length !== 4) return null;
  const [sku, palletSeq, , workOrderNumber] = parts;
  if (!sku || !palletSeq || !workOrderNumber) return null;
  return { sku, workOrderNumber };
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// PATCH /api/pallets/move
// body: { label, currentLocationCode, newLocationCode, quantity? }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const label = await normalizeLabel(db, sanitize(body.label ?? ""));
  const currentLocationCode = sanitize(body.currentLocationCode ?? "");
  const newLocationCode = sanitize(body.newLocationCode ?? "");
  const { quantity } = body;

  if (!label || !currentLocationCode || !newLocationCode) {
    return NextResponse.json(
      { error: "label, currentLocationCode, and newLocationCode are required" },
      { status: 400 }
    );
  }

  const [currentLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, currentLocationCode));
  if (!currentLocation) {
    return NextResponse.json({ error: "Unknown current location code" }, { status: 404 });
  }

  const [newLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, newLocationCode));
  if (!newLocation) {
    return NextResponse.json({ error: "Unknown destination location code" }, { status: 404 });
  }

  // 1. Exact match.
  const [exactPallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.locationId, currentLocation.id)));

  if (exactPallet) {
    if (exactPallet.status !== "ACTIVE") {
      return NextResponse.json({ error: "Only active pallets can be moved" }, { status: 409 });
    }
    if (exactPallet.locationId === newLocation.id) {
      return NextResponse.json({ error: "Pallet is already at that location" }, { status: 409 });
    }

    const conflict = await checkRackSkuConflict(db, newLocation, exactPallet.itemId);
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }

    const isFirstRacking = exactPallet.inForkliftUserId === null;

    const result = await db.transaction(async (tx) => {
      // Check whether the destination already has its own row under this
      // exact label — happens for default-code buckets, which can
      // legitimately exist at multiple locations at once. If so, merge into
      // it instead of relocating this row directly, since (label,
      // locationId) must stay unique.
      const [existingAtDestination] = await tx
        .select()
        .from(pallets)
        .where(and(eq(pallets.label, label), eq(pallets.locationId, newLocation.id)));

      let destinationPallet;

      if (existingAtDestination && existingAtDestination.id !== exactPallet.id) {
        if (existingAtDestination.status === "ACTIVE") {
          [destinationPallet] = await tx
            .update(pallets)
            .set({
              quantity: existingAtDestination.quantity + exactPallet.quantity,
              updatedAt: new Date(),
            })
            .where(eq(pallets.id, existingAtDestination.id))
            .returning();
        } else {
          [destinationPallet] = await tx
            .update(pallets)
            .set({
              status: "ACTIVE",
              quantity: exactPallet.quantity,
              removedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(pallets.id, existingAtDestination.id))
            .returning();
        }

        // Empty out the source row — its stock has been merged elsewhere.
        await tx
          .update(pallets)
          .set({ quantity: 0, status: "OUTBOUND", updatedAt: new Date() })
          .where(eq(pallets.id, exactPallet.id));
      } else {
        [destinationPallet] = await tx
          .update(pallets)
          .set({
            locationId: newLocation.id,
            inForkliftUserId: isFirstRacking ? session.userId : exactPallet.inForkliftUserId,
            firstRackedAt:
              exactPallet.firstRackedAt === null && newLocation.type === "RACK"
                ? new Date()
                : exactPallet.firstRackedAt,
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, exactPallet.id))
          .returning();
      }

      await tx.insert(palletEvents).values({
        palletId: destinationPallet.id,
        type: "MOVED",
        locationId: newLocation.id,
        userId: session.userId,
        quantity: exactPallet.quantity,
      });

      return destinationPallet;
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
        error: `This pallet is already at ${alreadyExistsElsewhere.locationCode}, not ${currentLocationCode}.`,
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
    const [sourceBucket] = await db
      .select()
      .from(pallets)
      .where(
        and(
          eq(pallets.label, item.defaultCode),
          eq(pallets.locationId, currentLocation.id),
          eq(pallets.status, "ACTIVE")
        )
      );

    if (sourceBucket) {
      if (!quantity || quantity <= 0) {
        return NextResponse.json(
          {
            error: "This is default stock, not an individually tracked pallet. Enter the quantity to move.",
            matchType: "default_needs_quantity",
            availableQuantity: sourceBucket.quantity,
          },
          { status: 400 }
        );
      }

      if (quantity > sourceBucket.quantity) {
        return NextResponse.json(
          { error: `Only ${sourceBucket.quantity} units available at the source location` },
          { status: 400 }
        );
      }

      const conflict = await checkRackSkuConflict(db, newLocation, item.id);
      if (conflict) {
        return NextResponse.json({ error: conflict }, { status: 409 });
      }

      const result = await db.transaction(async (tx) => {
        const remainingAtSource = sourceBucket.quantity - quantity;

        await tx
          .update(pallets)
          .set({
            quantity: remainingAtSource,
            status: remainingAtSource === 0 ? "OUTBOUND" : "ACTIVE",
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, sourceBucket.id));

        const [existingRealPallet] = await tx
          .select()
          .from(pallets)
          .where(and(eq(pallets.label, label), eq(pallets.locationId, newLocation.id)));

        let destinationPallet;
        if (existingRealPallet && existingRealPallet.status === "ACTIVE") {
          [destinationPallet] = await tx
            .update(pallets)
            .set({ quantity: existingRealPallet.quantity + quantity, updatedAt: new Date() })
            .where(eq(pallets.id, existingRealPallet.id))
            .returning();
        } else if (existingRealPallet && existingRealPallet.status === "OUTBOUND") {
          [destinationPallet] = await tx
            .update(pallets)
            .set({
              status: "ACTIVE",
              quantity,
              removedAt: null,
              inboundUserId: session.userId,
              updatedAt: new Date(),
            })
            .where(eq(pallets.id, existingRealPallet.id))
            .returning();
        } else {
          [destinationPallet] = await tx
            .insert(pallets)
            .values({
              label,
              itemId: item.id,
              workOrderNumber: sourceBucket.workOrderNumber,
              quantity,
              locationId: newLocation.id,
              inboundUserId: session.userId,
              firstRackedAt: newLocation.type === "RACK" ? new Date() : null,
            })
            .returning();
        }

        await tx.insert(palletEvents).values({
          palletId: destinationPallet.id,
          type: "MOVED",
          locationId: newLocation.id,
          userId: session.userId,
          quantity,
        });

        return destinationPallet;
      });

      return NextResponse.json({ ...result, matchType: "default_fallback", quantityMoved: quantity });
    }
  }

  // 3. Nothing exists at all — automatic inbound fallback.
  {
    const [settingsRow] = await db.select().from(settings).limit(1);

    const autoInboundAllowed =
      (currentLocation.type === "FLOOR" && settingsRow?.automaticInbound) ||
      (currentLocation.type === "RACK" && settingsRow?.automaticInboundFromRack);

    if (autoInboundAllowed) {
      const parsed = parseRealLabel(label);
      if (!parsed) {
        return NextResponse.json(
          { error: "Couldn't parse SKU/work order from this label for automatic inbound" },
          { status: 400 }
        );
      }

      const [autoItem] = await db
        .select()
        .from(items)
        .where(or(eq(items.sku, parsed.sku), eq(items.legacySku, parsed.sku)));
      if (!autoItem) {
        return NextResponse.json({ error: "Unknown SKU in scanned label" }, { status: 404 });
      }

      if (!quantity || quantity <= 0) {
        return NextResponse.json(
          {
            error: "This pallet was never scanned in. Enter its quantity to auto-inbound and move it.",
            matchType: "auto_inbound_needs_quantity",
          },
          { status: 400 }
        );
      }

      const conflict = await checkRackSkuConflict(db, newLocation, autoItem.id);
      if (conflict) {
        return NextResponse.json({ error: conflict }, { status: 409 });
      }

      const result = await db.transaction(async (tx) => {
        const [newPallet] = await tx
          .insert(pallets)
          .values({
            label,
            itemId: autoItem.id,
            workOrderNumber: parsed.workOrderNumber,
            quantity,
            locationId: currentLocation.id,
            inboundUserId: session.userId,
          })
          .returning();

        await tx.insert(palletEvents).values({
          palletId: newPallet.id,
          type: "INBOUND",
          locationId: currentLocation.id,
          userId: session.userId,
          quantity,
        });

        const [moved] = await tx
          .update(pallets)
          .set({
            locationId: newLocation.id,
            inForkliftUserId: session.userId,
            firstRackedAt: newLocation.type === "RACK" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, newPallet.id))
          .returning();

        await tx.insert(palletEvents).values({
          palletId: moved.id,
          type: "MOVED",
          locationId: newLocation.id,
          userId: session.userId,
          quantity,
        });

        return moved;
      });

      return NextResponse.json(
        { ...result, matchType: "auto_inbound", quantityMoved: quantity },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(
    { error: "No exact pallet and no default stock found for this item at that location" },
    { status: 404 }
  );
}