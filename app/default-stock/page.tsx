import { db } from "@/lib/db";
import { pallets, items } from "@/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getDefaultStockSummary() {
  return db
    .select({
      itemSku: items.sku,
      itemName: items.name,
      totalQuantity: sql<number>`sum(${pallets.quantity})::int`,
      locationCount: sql<number>`count(distinct ${pallets.locationId})::int`,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .where(eq(pallets.workOrderNumber, "INITIAL-STOCK"))
    .groupBy(items.sku, items.name);
}

export default async function DefaultStockPage() {
  const rows = await getDefaultStockSummary();

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Default Stock Summary</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Initial stock entered via default codes, totaled per item across
          all locations.
        </p>
      </header>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium text-right">Total Qty</th>
              <th className="px-4 py-3 font-medium text-right">Locations</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-600">
                  No default-code stock recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.itemSku} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-3 font-mono text-amber-500">{row.itemSku}</td>
                  <td className="px-4 py-3">{row.itemName}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.totalQuantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {row.locationCount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}