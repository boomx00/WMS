import type { CategoryListRow, UnitListRow } from "@/lib/units";

export type Item = {
  id: number;
  sku: string;
  legacySku: string | null;
  cartonBarcode: string | null;
  name: string;
  categoryId: number | null;
  cartonBagQty: number; // secondary units per primary (e.g. packs per carton)
  palletCartonQty: number; // primary units per storage unit (e.g. cartons per pallet)
  productType: string | null;
  brand: string | null;
  tags: string[];
  supplierId: number | null;
};

export type Supplier = { id: number; name: string; kind: "PRODUCTION" | "EXTERNAL" };

export type Unit = UnitListRow;
export type Category = CategoryListRow;

// Every Type / Brand / Tag in use, offered as suggestions so the same value
// is typed the same way everywhere, every supplier, and the units and
// product categories.
export type Options = {
  types: string[];
  brands: string[];
  tags: string[];
  suppliers: Supplier[];
  units: Unit[];
  categories: Category[];
};
