import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents, locationStock, salesOrders, tambahanOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessPdaAllowed } from "@/lib/pdaPermissions";
import { adjustLocationStock } from "@/lib/locationStock";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getLocationByCode, isSingleSku } from "@/lib/locationRules";
import { getMarkedAt, type OrderRef } from "@/lib/stagingMarks";
function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/move
// body: { sourceLocationCode, destinationLocationCode, itemSku, quantity,
//         markedSoNumber?, markedTambahanNumber? }
//
// Moving out of a STAGING location, the stock is either unmarked (ecer) —
// neither marked field sent — or marked for one SO / Tambahan:
//   - unmarked: at most the location's ecer stock; a plain MOVE.
//   - marked, to another staging location: the marking moves with it
//     (a MOVE tagged with the order).
//   - marked, to any other location: it's un-picked — logged as a
//     negative PICKING for the order (like Tambahan's return to original
//     location), so the order's picked and marked amounts go down.
// Marked stock has to physically be there: Default Move doesn't apply.
//
// Rules (governed by "Default Move" / allowNegativeRackStock setting):
//   - Source occupied by a DIFFERENT SKU → always blocked, setting has no effect.
//   - Same SKU present, sufficient quantity → always allowed (MOVE).
//   - Same SKU present but NOT enough, OR source genuinely empty:
//       setting ON  → allowed, source clamped to exactly 0, logged as DEFAULT_MOVE.
//       setting OFF → blocked with a clear insufficient-stock error.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessPdaAllowed(session, "pda.move");
  if (denied) return denied;

  const body = await req.json();
  const sourceLocationCode = sanitize(body.sourceLocationCode ?? "");
  const destinationLocationCode = sanitize(body.destinationLocationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const { quantity } = body;

  if (!sourceLocationCode || !destinationLocationCode || !itemSku || !quantity || quantity <= 0) {
    return NextResponse.json(
      {
        error:
          "sourceLocationCode, destinationLocationCode, itemSku, and a positive quantity are required",
      },
      { status: 400 }
    );
  }

  const sourceLocation = await getLocationByCode(db, sourceLocationCode);
  if (!sourceLocation) {
    return NextResponse.json({ error: "Unknown source location code" }, { status: 404 });
  }

  const [destinationLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, destinationLocationCode));
  if (!destinationLocation) {
    return NextResponse.json({ error: "Unknown destination location code" }, { status: 404 });
  }

  if (sourceLocation.id === destinationLocation.id) {
    return NextResponse.json({ error: "Source and destination are the same location" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }
  const markedSoNumber = sanitize(body.markedSoNumber ?? "");
  const markedTambahanNumber = sanitize(body.markedTambahanNumber ?? "");
  if (markedSoNumber && markedTambahanNumber) {
    return NextResponse.json({ error: "Choose either an SO or a Tambahan, not both" }, { status: 400 });
  }

  // Marked stock (for one order) only exists in staging locations.
  let order: (OrderRef & { label: string }) | null = null;
  if (markedSoNumber || markedTambahanNumber) {
    if (!sourceLocation.isStaging) {
      return NextResponse.json(
        { error: `${sourceLocation.code} isn't a staging location — its stock isn't marked for any order` },
        { status: 400 }
      );
    }
    if (markedSoNumber) {
      const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, markedSoNumber));
      if (!salesOrder) {
        return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
      }
      order = { salesOrderId: salesOrder.id, label: salesOrder.soNumber };
    } else {
      const [tambahan] = await db
        .select()
        .from(tambahanOrders)
        .where(eq(tambahanOrders.tambahanNumber, markedTambahanNumber));
      if (!tambahan) {
        return NextResponse.json({ error: "Unknown Tambahan number" }, { status: 404 });
      }
      order = { tambahanOrderId: tambahan.id, label: tambahan.tambahanNumber };
    }

    const marked = await getMarkedAt(db, order, item.id, sourceLocation.id);
    if (quantity > marked) {
      return NextResponse.json(
        {
          error:
            marked <= 0
              ? `Tidak ada stok ${itemSku} untuk ${order.label} di ${sourceLocation.code}.`
              : `Hanya ${marked} karton ${itemSku} untuk ${order.label} di ${sourceLocation.code}.`,
        },
        { status: 409 }
      );
    }
  } else if (sourceLocation.isStaging) {
    // A staging location's physical total includes stock reserved for open
    // SOs and Tambahans — an unmarked Move must never dip into that, only
    // the genuinely unmarked ("ecer") portion. This is a hard cap
    // independent of the Default Move setting below, since Default Move is
    // about tolerating a location-count mismatch, not about permission to
    // take reserved stock.
    const unmarked = await getUnclaimedQuantity(db, item.id, sourceLocation.id);
    if (quantity > unmarked) {
      return NextResponse.json(
        {
          error:
            unmarked <= 0
              ? `Semua stok ${itemSku} di ${sourceLocation.code} sudah ter-alokasi ke SO/Tambahan — pilih SO/Tambahan-nya untuk memindahkan.`
              : `Hanya ${unmarked} karton ${itemSku} yang belum ter-alokasi (ecer) di ${sourceLocation.code} — sisanya sudah dipesan untuk SO/Tambahan.`,
        },
        { status: 409 }
      );
    }
  }

  const allStockAtSource = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, sourceLocation.id));

  const matchingRow = allStockAtSource.find((r) => r.itemId === item.id);
  const occupiedByOther = allStockAtSource.some((r) => r.itemId !== item.id && r.quantity > 0);

  // Only "Only 1 SKU" location types (today: RACK) are single-SKU.
  if (isSingleSku(sourceLocation.rules) && occupiedByOther) {
    return NextResponse.json(
      { error: `${sourceLocationCode} sudah berisi SKU lain, bukan ${itemSku}` },
      { status: 409 }
    );
  }

  const availableAtSource = matchingRow?.quantity ?? 0;
  const sufficient = quantity <= availableAtSource;

  let eventType: "MOVE" | "DEFAULT_MOVE" = "MOVE";

  if (!sufficient && order) {
    return NextResponse.json(
      { error: `Hanya ada ${availableAtSource} karton ${itemSku} di ${sourceLocationCode}!` },
      { status: 409 }
    );
  }

  if (!sufficient) {
    const [settingsRow] = await db.select().from(settings).limit(1);
    if (!settingsRow?.allowNegativeRackStock) {
      return NextResponse.json(
        {
          error:
            availableAtSource === 0
              ? `Tidak ada stock barang ${itemSku} di ${sourceLocationCode}! Enable Default Move in Settings to allow this.`
              : `Hanya ada ${availableAtSource} karton ${itemSku} di ${sourceLocationCode}! Enable Default Move in Settings to allow taking more.`,
        },
        { status: 409 }
      );
    }
    eventType = "DEFAULT_MOVE";
  }

  const sourceDecrement = Math.min(quantity, Math.max(availableAtSource, 0));

  try {
    await db.transaction(async (tx) => {
      await adjustLocationStock(tx, sourceLocation.id, item.id, -sourceDecrement);
      await adjustLocationStock(tx, destinationLocation.id, item.id, quantity);

      const orderTag = {
        salesOrderId: order && "salesOrderId" in order ? order.salesOrderId : null,
        tambahanOrderId: order && "tambahanOrderId" in order ? order.tambahanOrderId : null,
      };

      if (order && !destinationLocation.isStaging) {
        // Un-pick: the reverse of a pick from the destination into this
        // staging location.
        await tx.insert(locationStockEvents).values({
          type: "PICKING",
          itemId: item.id,
          sourceLocationId: destinationLocation.id,
          destinationLocationId: sourceLocation.id,
          ...orderTag,
          quantity: -quantity,
          userId: session.userId,
        });
      } else {
        // Plain move, or marked stock moving to another staging location
        // (the order tag carries the marking along).
        await tx.insert(locationStockEvents).values({
          type: eventType,
          itemId: item.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: destinationLocation.id,
          ...orderTag,
          quantity,
          userId: session.userId,
        });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to move";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    sourceLocationCode: sourceLocation.code,
    destinationLocationCode: destinationLocation.code,
    itemSku: item.sku,
    quantityMoved: quantity,
    matchType: eventType === "DEFAULT_MOVE" ? "default_move" : "exact",
    markedFor: order?.label ?? null,
    unpicked: !!order && !destinationLocation.isStaging,
  });
}