// Parses a pallet label "SKU*seq*qty*WO". Currently not used by any form.

export function parseLabel(raw: string) {
  const parts = raw.trim().split("*");
  if (parts.length !== 4) return null;
  const [sku, palletSeq, qty, workOrderNumber] = parts;
  const quantity = Number(qty);
  if (!sku || !palletSeq || Number.isNaN(quantity) || !workOrderNumber) return null;
  return { sku, palletSeq, quantity, workOrderNumber };
}
