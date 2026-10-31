export type Item = {
  id: number;
  sku: string;
  legacySku: string | null;
  cartonBarcode: string | null;
  name: string;
  cartonBagQty: number;
  palletCartonQty: number;
  productType: string | null;
  brand: string | null;
  tags: string[];
  supplierId: number | null;
};

export type Supplier = { id: number; name: string; kind: "PRODUCTION" | "EXTERNAL" };

// Every Type / Brand / Tag in use, offered as suggestions so the same value
// is typed the same way everywhere, and every supplier.
export type Options = { types: string[]; brands: string[]; tags: string[]; suppliers: Supplier[] };
