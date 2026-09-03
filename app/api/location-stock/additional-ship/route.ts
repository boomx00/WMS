import { NextRequest, NextResponse } from "next/server";
import {
  locationStock,
  locations,
  items,
  salesOrders,
  tambahanOrders,
  palletEvents,
  pallets,
  locationStockEvents,
} from "@/db/schema";
import { db } from "@/lib/db";
import { eq, and, or } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";
import { adjustLocationStock } from "@/lib/locationStock";
import { getPickedForTambahanQuantity } from "@/lib/pickedForTambahan";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// PATCH /api/location-stock/additional-ship
// body: { soNumber, label, quantity }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const authorized = await hasRole(session.userId, ["Admin", "Checker"]);
  if (!authorized) {
    return NextResponse.json(
      { error: "Only Checker and Admin roles can perform shipping" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const soNumber = sanitize(body.soNumber ?? "");
  const rawLabel = sanitize(body.label ?? "");
  const { quantity } = body;

  if (!soNumber || !rawLabel || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "soNumber, label, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const label = await normalizeLabel(db, rawLabel);
  const sku = extractSku(label);
  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.parentSalesOrderId, salesOrder.id));

  if (!tambahan) {
    return NextResponse.json({ error: `No Additional batch exists for ${soNumber}` }, { status: 404 });
  }
  if (tambahan.status === "CONVERTED") {
    return NextResponse.json(
      { error: `${tambahan.tambahanNumber} was already converted to a new SO — ship against that instead.` },
      { status: 409 }
    );
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const availableForThisTambahan = await getPickedForTambahanQuantity(db, tambahan.id, item.id);

  if (quantity > availableForThisTambahan) {
    return NextResponse.json(
      {
        error:
          availableForThisTambahan <= 0
            ? `Belum ada picking untuk ${soNumber} barang ${item.sku} !! Lakukan picking dulu !!.`
            : `Hanya ${availableForThisTambahan} karton ${item.sku} sudah di picking untuk ${soNumber} !!. Pick lebih banyak dulu !!`,
      },
      { status: 409 }
    );
  }

  const [exactPallet] = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.label, label), eq(pallets.status, "ACTIVE")));

  const targetIsDefaultBucket = exactPallet ? exactPallet.label === item.defaultCode : true;

  try {
    await db.transaction(async (tx) => {
      if (targetIsDefaultBucket) {
        const [stockRow] = await tx
          .select()
          .from(locationStock)
          .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, item.id)));

        const trueAvailable = stockRow?.quantity ?? 0;
        if (quantity > trueAvailable) {
          throw new Error(`Only ${trueAvailable} units of ${item.sku} available in Outbound Warehouse`);
        }

        const [existingBucket] = await tx
          .select()
          .from(pallets)
          .where(and(eq(pallets.label, item.defaultCode), eq(pallets.locationId, outboundWh.id)));

        let bucket;
        if (existingBucket) {
          [bucket] = await tx
            .update(pallets)
            .set({
              status: "ACTIVE",
              quantity: trueAvailable - quantity,
              removedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(pallets.id, existingBucket.id))
            .returning();
        } else {
          [bucket] = await tx
            .insert(pallets)
            .values({
              label: item.defaultCode,
              itemId: item.id,
              workOrderNumber: "INITIAL-STOCK",
              quantity: trueAvailable - quantity,
              locationId: outboundWh.id,
              status: "ACTIVE",
              inboundUserId: session.userId,
            })
            .returning();
        }

        if (bucket.quantity === 0) {
          await tx.update(pallets).set({ status: "OUTBOUND" }).where(eq(pallets.id, bucket.id));
        }

        await tx.insert(palletEvents).values({
          palletId: bucket.id,
          type: "OUTBOUND",
          locationId: outboundWh.id,
          userId: session.userId,
          quantity,
        });
      } else {
        if (quantity > exactPallet!.quantity) {
          throw new Error(`This pallet only has ${exactPallet!.quantity} units recorded`);
        }

        await tx
          .update(pallets)
          .set({
            status: "OUTBOUND",
            outForkliftUserId: session.userId,
            removedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, exactPallet!.id));

        await tx.insert(palletEvents).values({
          palletId: exactPallet!.id,
          type: "OUTBOUND",
          locationId: outboundWh.id,
          userId: session.userId,
          quantity,
        });

        const leftoverQty = exactPallet!.quantity - quantity;
        if (leftoverQty > 0) {
          const [existingDefault] = await tx
            .select()
            .from(pallets)
            .where(and(eq(pallets.label, item.defaultCode), eq(pallets.locationId, outboundWh.id)));

          let leftoverPallet;
          if (existingDefault && existingDefault.status === "ACTIVE") {
            [leftoverPallet] = await tx
              .update(pallets)
              .set({ quantity: existingDefault.quantity + leftoverQty, updatedAt: new Date() })
              .where(eq(pallets.id, existingDefault.id))
              .returning();
          } else if (existingDefault) {
            [leftoverPallet] = await tx
              .update(pallets)
              .set({
                status: "ACTIVE",
                quantity: leftoverQty,
                removedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(pallets.id, existingDefault.id))
              .returning();
          } else {
            [leftoverPallet] = await tx
              .insert(pallets)
              .values({
                label: item.defaultCode,
                itemId: exactPallet!.itemId,
                workOrderNumber: exactPallet!.workOrderNumber,
                quantity: leftoverQty,
                locationId: outboundWh.id,
                status: "ACTIVE",
                splitFromPalletId: exactPallet!.id,
                inboundUserId: session.userId,
              })
              .returning();
          }

          await tx.insert(palletEvents).values({
            palletId: leftoverPallet.id,
            type: "SPLIT",
            locationId: outboundWh.id,
            userId: session.userId,
            quantity: leftoverQty,
          });
        }
      }

      await adjustLocationStock(tx, outboundWh.id, item.id, -quantity);

      await tx.insert(locationStockEvents).values({
        type: "SHIP",
        itemId: item.id,
        sourceLocationId: outboundWh.id,
        destinationLocationId: null,
        salesOrderId: null,
        tambahanOrderId: tambahan.id,
        quantity,
        userId: session.userId,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to ship";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    itemSku: item.sku,
    quantityShipped: quantity,
    remainingToShip: availableForThisTambahan - quantity,
  });
}