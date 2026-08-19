import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, palletEvents, locations, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";
import { hasRole } from "@/lib/auth";
function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/pallets/ship
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
  const label = await normalizeLabel(db, sanitize(body.label ?? ""));
  const { quantity } = body;

  if (!soNumber || !label || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "soNumber, label, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const [outboundWh] = await db
    .select()
    .from(locations)
    .where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const [pallet] = await db
    .select()
    .from(pallets)
    .where(
      and(
        eq(pallets.label, label),
        eq(pallets.locationId, outboundWh.id),
        eq(pallets.status, "ACTIVE")
      )
    );

  if (!pallet) {
    return NextResponse.json(
      { error: "Barang ini tidak ditemukan di OUTBOUND_WH, lakukan PICKING dulu" },
      { status: 404 }
    );
  }

  if (quantity > pallet.quantity) {
    return NextResponse.json(
      { error: `Only ${pallet.quantity} units available to ship for this pallet` },
      { status: 400 }
    );
  }

  const [orderLine] = await db
    .select()
    .from(salesOrderItems)
    .where(
      and(eq(salesOrderItems.salesOrderId, salesOrder.id), eq(salesOrderItems.itemId, pallet.itemId))
    );

  if (!orderLine) {
    return NextResponse.json(
      { error: `This item isn't on sales order ${soNumber}` },
      { status: 400 }
    );
  }

  const [alreadyShippedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(
      and(
        eq(palletEvents.salesOrderId, salesOrder.id),
        eq(pallets.itemId, pallet.itemId),
        eq(palletEvents.type, "OUTBOUND")
      )
    );

  const alreadyShipped = alreadyShippedRow?.total ?? 0;
  const remaining = orderLine.quantity - alreadyShipped;

  if (quantity > remaining) {
    return NextResponse.json(
      {
        error: `${alreadyShipped} sudah terkirim, sisa ${remaining} di sales order ${soNumber} untuk barang tersebut.`,
      },
      { status: 409 }
    );
  }

  const result = await db.transaction(async (tx) => {
    const remainingOnPallet = pallet.quantity - quantity;

    const [updated] = await tx
      .update(pallets)
      .set({
        quantity: remainingOnPallet,
        status: remainingOnPallet === 0 ? "OUTBOUND" : "ACTIVE",
        outForkliftUserId: remainingOnPallet === 0 ? session.userId : pallet.outForkliftUserId,
        removedAt: remainingOnPallet === 0 ? new Date() : pallet.removedAt,
        updatedAt: new Date(),
      })
      .where(eq(pallets.id, pallet.id))
      .returning();

    await tx.insert(palletEvents).values({
      palletId: updated.id,
      type: "OUTBOUND",
      locationId: outboundWh.id,
      userId: session.userId,
      quantity,
      salesOrderId: salesOrder.id,
    });

    return updated;
  });

  return NextResponse.json({
    ...result,
    quantityShipped: quantity,
    remainingOnOrder: remaining - quantity,
  });
}