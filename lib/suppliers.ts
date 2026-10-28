import { suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

// Suppliers: where products come from — PRODUCTION (in-house) or EXTERNAL.
// Production inbound from the PDA (INBOUND / DEFAULT_INBOUND) is always
// recorded against the Production supplier.

export const PRODUCTION_SUPPLIER_NAME = "Production";

export type SupplierKind = "PRODUCTION" | "EXTERNAL";
export type SupplierOption = { id: number; name: string; kind: SupplierKind };

export function isSupplierKind(v: unknown): v is SupplierKind {
  return v === "PRODUCTION" || v === "EXTERNAL";
}

// Every supplier, Production ones first, then by name.
export async function getSuppliers(db: any): Promise<SupplierOption[]> {
  const rows: SupplierOption[] = await db
    .select({ id: suppliers.id, name: suppliers.name, kind: suppliers.kind })
    .from(suppliers)
    .orderBy(asc(suppliers.name));
  return rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "PRODUCTION" ? -1 : 1));
}

// The supplier production inbound is recorded against: the oldest
// PRODUCTION supplier, created as "Production" if there is none.
export async function getProductionSupplierId(db: any): Promise<number> {
  const [existing] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.kind, "PRODUCTION"))
    .orderBy(asc(suppliers.id))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(suppliers)
    .values({ name: PRODUCTION_SUPPLIER_NAME, kind: "PRODUCTION" })
    .onConflictDoNothing()
    .returning({ id: suppliers.id });
  if (created) return created.id;
  // A supplier already named "Production" (as EXTERNAL): use it.
  const [byName] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.name, PRODUCTION_SUPPLIER_NAME))
    .limit(1);
  return byName.id;
}
