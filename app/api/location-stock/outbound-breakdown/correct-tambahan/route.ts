import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, tambahanOrders, locationStockEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getPickedForTambahanQuantity } from "@/lib/pickedForTambahan";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/outbound-breakdown/correct-tambahan
// body: { itemSku, tambahanNumber, newQuantity }
//
// Same mechanism as .../outbound-breakdown/correct, but for a Tambahan
// batch instead of a real SO: inserts a CLAIM event tagged with
// tambahanOrderId (not salesOrderId) for whatever signed delta is needed
// to reach newQuantity. This keeps the accounting balanced the same way —
// CLAIM is subtracted from the general unmarked pool regardless of which
// SO/Tambahan it's tagged to, and added back into this Tambahan's total.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const itemSku = sanitize(body.itemSku ?? "");
  const tambahanNumber = sanitize(body.tambahanNumber ?? "");
  const { newQuantity } = body;

  if (!itemSku || !tambahanNumber || newQuantity === undefined || newQuantity < 0) {
    return NextResponse.json(
      { error: "itemSku, tambahanNumber, and a non-negative newQuantity are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.tambahanNumber, tambahanNumber));
  if (!tambahan) {
    return NextResponse.json({ error: "Unknown Tambahan number" }, { status: 404 });
  }
  if (tambahan.status === "CONVERTED") {
    return NextResponse.json(
      { error: `${tambahan.tambahanNumber} was already converted — correct the new SO instead.` },
      { status: 409 }
    );
  }

  const currentMarked = await getPickedForTambahanQuantity(db, tambahan.id, item.id);
  const delta = newQuantity - currentMarked;

  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current marked quantity" }, { status: 400 });
  }

  await db.insert(locationStockEvents).values({
    type: "CLAIM",
    itemId: item.id,
    sourceLocationId: null,
    destinationLocationId: null,
    salesOrderId: null,
    tambahanOrderId: tambahan.id,
    quantity: delta,
    userId: session.userId,
  });

  return NextResponse.json({ itemSku, tambahanNumber, previousMarked: currentMarked, newQuantity, delta });
}