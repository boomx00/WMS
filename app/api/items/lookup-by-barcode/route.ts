import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveItemCode, sanitizeCode } from "@/lib/itemLookup";
import { getOnePdaItemUnits, getPdaItemUnits } from "@/lib/pdaRules";

export const dynamic = "force-dynamic";

// GET /api/items/lookup-by-barcode?barcode=8990052000405[&expectedSku=SKU][&exactSku=1]
// The product a scanned / typed code stands for. What the code is matched
// against (SKU, legacy SKU, carton barcode + extra barcodes) is set in
// Settings → PDA (lib/itemLookup.ts); a full pallet label is matched by its
// SKU segment.
//   expectedSku — the product the screen expects; wins when a shared
//                 barcode matches several products.
//   exactSku=1  — `barcode` is a SKU the PDA already knows (not typed by a
//                 worker): match the current SKU only, whatever the setting.
// 409 when the code matches several products: `candidates` lists them, so
// the PDA can take the one that's at the location.
// `units`: the product's primary / storage units for the PDA's quantity
// fields (Settings → PDA).
export async function GET(req: NextRequest) {
  const raw = sanitizeCode(req.nextUrl.searchParams.get("barcode") ?? "");
  if (!raw) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  const exactSku = req.nextUrl.searchParams.get("exactSku") === "1";
  const found = await resolveItemCode(db, raw, {
    expectedSku: req.nextUrl.searchParams.get("expectedSku"),
    fields: exactSku ? ["SKU"] : undefined,
  });

  if (!found.ok) {
    if (found.candidates) {
      const unitMap = await getPdaItemUnits(db, found.candidates.map((c) => c.id));
      return NextResponse.json(
        {
          error: found.error,
          candidates: found.candidates.map((c) => ({
            sku: c.sku,
            name: c.name,
            palletCartonQty: c.palletCartonQty,
            units: unitMap.get(c.id) ?? null,
          })),
        },
        { status: found.status }
      );
    }
    return NextResponse.json({ error: found.error }, { status: found.status });
  }

  const item = found.item;
  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    palletCartonQty: item.palletCartonQty,
    units: await getOnePdaItemUnits(db, item.id),
  });
}
