import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locationStockEvents, locations, salesOrders, tambahanOrders } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getMarkRows } from "@/lib/stagingMarks";

// POST /api/sales-orders/:soNumber/tambahan/cancel
//
// Cancels an ACTIVE Tambahan batch that's EMPTY — typically one started by
// a mis-tap on the PDA (the pick endpoint creates the batch before it
// checks the pick, so a failed pick can leave an empty one behind). Empty
// means:
//   - nothing is marked for it in any location (whatever was picked has
//     been returned — to its original location or to ecer), and
//   - nothing has shipped under it (SHIP rows net to zero).
// The batch row is deleted, so the parent SO no longer counts as having an
// open Tambahan. Any events it did have (e.g. a pick that was returned)
// stay in the ledger untouched except for losing the link: their
// tambahan_order_id is cleared and the Tambahan number is kept in
// deleted_so_number — the same way a deleted SO's events are kept — so
// Movement History still shows them. No stock moves: with nothing marked
// and nothing shipped, unlinking changes no balances.
//
// A CONVERTED batch can't be cancelled: it already has a real SO number.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "so.tambahan");
  if (denied) return denied;

  const { soNumber } = await params;

  const [parentSalesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!parentSalesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Locked, so two cancels (or a cancel and a convert) can't interleave.
      const [tambahan] = await tx
        .select()
        .from(tambahanOrders)
        .where(eq(tambahanOrders.parentSalesOrderId, parentSalesOrder.id))
        .for("update");

      if (!tambahan) throw new CancelError("No Tambahan batch exists for this SO", 404);
      if (tambahan.status === "CONVERTED") {
        throw new CancelError(
          `${tambahan.tambahanNumber} was already converted to ${tambahan.convertedSoNumber ?? "an SO"} — it can't be cancelled.`,
          409
        );
      }

      const touchedItems = await tx
        .selectDistinct({ itemId: locationStockEvents.itemId })
        .from(locationStockEvents)
        .where(eq(locationStockEvents.tambahanOrderId, tambahan.id));
      const itemIds = touchedItems.map((r) => r.itemId);

      if (itemIds.length > 0) {
        const [shippedRows, markRows, itemRows] = await Promise.all([
          tx
            .select({
              itemId: locationStockEvents.itemId,
              quantity: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::float8`,
            })
            .from(locationStockEvents)
            .where(and(eq(locationStockEvents.tambahanOrderId, tambahan.id), eq(locationStockEvents.type, "SHIP")))
            .groupBy(locationStockEvents.itemId),
          Promise.all(itemIds.map((itemId) => getMarkRows(tx, { itemId, tambahanOrderIds: [tambahan.id] }))),
          tx.select({ id: items.id, sku: items.sku }).from(items).where(inArray(items.id, itemIds)),
        ]);
        const skuOf = new Map(itemRows.map((i) => [i.id, i.sku]));

        const shipped = shippedRows.filter((r) => r.quantity !== 0);
        if (shipped.length > 0) {
          const list = shipped.map((r) => `${skuOf.get(r.itemId) ?? "?"} (${r.quantity})`).join(", ");
          throw new CancelError(
            `${tambahan.tambahanNumber} isn't empty — it has already shipped ${list}. Only an empty Tambahan can be cancelled.`,
            409
          );
        }

        const marked = markRows.flat();
        if (marked.length > 0) {
          const locationIds = marked.map((m) => m.locationId).filter((id): id is number => id !== null);
          const codes = locationIds.length
            ? await tx
                .select({ id: locations.id, code: locations.code })
                .from(locations)
                .where(inArray(locations.id, locationIds))
            : [];
          const codeOf = new Map(codes.map((c) => [c.id, c.code]));
          const list = markRows
            .flatMap((rows, i) =>
              rows.map(
                (r) =>
                  `${skuOf.get(itemIds[i]) ?? "?"} ${r.quantity} at ${
                    r.locationId === null ? "?" : codeOf.get(r.locationId) ?? "?"
                  }`
              )
            )
            .join(", ");
          throw new CancelError(
            `${tambahan.tambahanNumber} isn't empty — still picked: ${list}. Return it first (Delete on the line), then cancel.`,
            409
          );
        }
      }

      // Unlink its (net-zero) events, keeping the number for history.
      const detached = await tx
        .update(locationStockEvents)
        .set({ tambahanOrderId: null, deletedSoNumber: tambahan.tambahanNumber })
        .where(eq(locationStockEvents.tambahanOrderId, tambahan.id))
        .returning({ id: locationStockEvents.id });

      await tx.delete(tambahanOrders).where(eq(tambahanOrders.id, tambahan.id));

      return { tambahanNumber: tambahan.tambahanNumber, detachedEvents: detached.length };
    });

    return NextResponse.json({ cancelled: result.tambahanNumber, detachedEvents: result.detachedEvents });
  } catch (err) {
    if (err instanceof CancelError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

class CancelError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}