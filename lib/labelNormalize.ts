import { items } from "@/db/schema";
import { eq, or } from "drizzle-orm";

// Rewrites a scanned label so its SKU segment always uses the item's CURRENT
// sku, even if the physical barcode still carries an old/legacy code. This
// runs on every write AND every lookup, so a pallet is always stored and
// found under the current code — regardless of which code was printed on
// the physical label at the time it was made.
export async function normalizeLabel(db: any, rawLabel: string): Promise<string> {
  const hadLeadingStar = rawLabel.startsWith("*");
  const cleaned = rawLabel.replace(/^\*/, "");
  const parts = cleaned.split("*");

  // Only real 4-segment printed labels (SKU*seq*qty*WO) can carry a legacy
  // code — default codes and SPLIT labels are already generated from the
  // current sku, so leave anything else untouched.
  if (parts.length !== 4) return rawLabel;

  const [scannedSku, ...rest] = parts;

  const [item] = await db
    .select({ sku: items.sku })
    .from(items)
    .where(or(eq(items.sku, scannedSku), eq(items.legacySku, scannedSku)));

  if (!item || item.sku === scannedSku) return rawLabel; // already current, or unknown SKU (let downstream handle the error)

  const rebuilt = [item.sku, ...rest].join("*");
  return hadLeadingStar ? `*${rebuilt}` : rebuilt;
}