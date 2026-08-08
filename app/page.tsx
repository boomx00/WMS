import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import WarehouseMap from "@/components/WarehouseMap";

export const dynamic = "force-dynamic";

async function getActiveInventory() {
  return db
    .select({
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      updatedAt: pallets.updatedAt,
      itemSku: items.sku,
      itemName: items.name,
      locationCode: locations.code,
      locationType: locations.type,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(ne(pallets.status, "REMOVED"))
    .orderBy(locations.code);
}

export default async function InventoryPage() {
  const rows = await getActiveInventory();

  const totalPallets = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.quantity, 0);
  const onFloor = rows.filter((r) => r.locationType === "FLOOR").length;
  const onRack = rows.filter((r) => r.locationType === "RACK").length;

  return (
    <div className="p-8">
    <header className="mb-8">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-zinc-500 text-sm mt-1">
        Active pallets currently in the warehouse.
      </p>
    </header>

        <div className="max-w-6xl">
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Active pallets" value={totalPallets.toString()} />
        <StatCard label="Total units" value={totalUnits.toLocaleString()} />
        <StatCard label="On floor" value={onFloor.toString()} />
        <StatCard label="Racked" value={onRack.toString()} />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Work Order</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.palletId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`font-mono ${
                        row.locationType === "FLOOR"
                          ? "text-blue-400"
                          : "text-amber-500"
                      }`}
                    >
                      {row.locationCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {row.itemSku}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{row.itemName}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">
                    {row.workOrderNumber}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                    {new Date(row.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4">Warehouse Map</h2>
        <WarehouseMap />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg px-5 py-4 bg-zinc-900/30">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div>
      
    </div>
    // <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-16 text-center">
    //   <p className="text-zinc-400">No active pallets in the warehouse.</p>
    //   <p className="text-zinc-600 text-sm mt-1">
    //     Scan a product label in from Postman (or the PDA app later) to see it
    //     here.
    //   </p>
    // </div>
  );
}