// Server-only: sales order document types (sales_order_types), managed on
// Sales Orders → Sales Order Types (/sales-order-types). Each sales order
// picks one when it's created; orders from before types existed have none.

import { salesOrders, salesOrderTypes } from "@/db/schema";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { formatSoDisplay } from "@/lib/soDisplay";

export type SalesOrderType = {
  id: number;
  name: string;
  description: string | null;
  // Fixed start of this type's SO numbers, e.g. "SO-"; null = none.
  numberPrefix: string | null;
};
export type SalesOrderTypeListRow = SalesOrderType & { orderCount: number };

// Every type, by name.
export async function getSalesOrderTypes(db: any): Promise<SalesOrderType[]> {
  return db
    .select({
      id: salesOrderTypes.id,
      name: salesOrderTypes.name,
      description: salesOrderTypes.description,
      numberPrefix: salesOrderTypes.numberPrefix,
    })
    .from(salesOrderTypes)
    .orderBy(asc(sql`lower(${salesOrderTypes.name})`));
}

// Same, with how many sales orders use each one.
export async function listSalesOrderTypesWithCounts(db: any): Promise<SalesOrderTypeListRow[]> {
  return db
    .select({
      id: salesOrderTypes.id,
      name: salesOrderTypes.name,
      description: salesOrderTypes.description,
      numberPrefix: salesOrderTypes.numberPrefix,
      orderCount: sql<number>`count(${salesOrders.id})::int`,
    })
    .from(salesOrderTypes)
    .leftJoin(salesOrders, eq(salesOrders.salesOrderTypeId, salesOrderTypes.id))
    .groupBy(salesOrderTypes.id)
    .orderBy(asc(sql`lower(${salesOrderTypes.name})`));
}

export function cleanTypeName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

// For APIs that list sales orders to the PDA: returns a function giving an
// order's type name and its display text ("SO - 202608000162"). Loads the
// (small) type list once, so call it once per request.
export async function getSoDisplayLookup(db: any) {
  const types = await getSalesOrderTypes(db);
  const byId = new Map(types.map((t) => [t.id, t]));
  return (order: { soNumber: string; salesOrderTypeId: number | null }) => {
    const type = order.salesOrderTypeId != null ? byId.get(order.salesOrderTypeId) : undefined;
    return {
      salesOrderTypeName: type?.name ?? null,
      soDisplay: formatSoDisplay(order.soNumber, type),
    };
  };
}

// Optional description: trimmed, or null when left empty.
export function cleanTypeDescription(value: unknown): string | null {
  const v = typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
  return v || null;
}

// Optional SO number prefix, kept exactly as typed (e.g. "SO-") apart
// from leading spaces — a trailing space may be part of the format — or
// null when left empty.
export function cleanNumberPrefix(value: unknown): string | null {
  const v = typeof value === "string" ? value.replace(/\0/g, "").replace(/^\s+/, "") : "";
  return v.trim() ? v : null;
}

// The Sales Orders page's type filter: ?type=<id> or ?type=none (orders with
// no type). Anything else = all orders.
export type SalesOrderTypeFilter = number | "none" | null;

export function parseTypeFilter(value: string | null | undefined): SalesOrderTypeFilter {
  if (value === "none") return "none";
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function typeFilterCondition(filter: SalesOrderTypeFilter) {
  if (filter === "none") return isNull(salesOrders.salesOrderTypeId);
  if (filter !== null) return eq(salesOrders.salesOrderTypeId, filter);
  return undefined;
}

// True if another type (not `exceptId`) already has this name, ignoring case.
export async function typeNameTaken(db: any, name: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: salesOrderTypes.id })
    .from(salesOrderTypes)
    .where(
      and(
        sql`lower(${salesOrderTypes.name}) = lower(${name})`,
        exceptId ? ne(salesOrderTypes.id, exceptId) : undefined
      )
    )
    .limit(1);
  return !!row;
}

// For the create / edit sales order APIs: the chosen type must exist.
export async function resolveSalesOrderTypeId(
  db: any,
  value: unknown
): Promise<{ id: number } | { error: string; status: number }> {
  const id = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isInteger(id) || id <= 0) {
    return { error: "Choose a document type", status: 400 };
  }
  const [row] = await db
    .select({ id: salesOrderTypes.id })
    .from(salesOrderTypes)
    .where(eq(salesOrderTypes.id, id))
    .limit(1);
  if (!row) {
    return { error: "That document type no longer exists — refresh and choose again", status: 400 };
  }
  return { id: row.id };
}
