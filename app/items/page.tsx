import { db } from "@/lib/db";
import { items } from "@/db/schema";
import CreateItemForm from "./CreateItemForm";
import LegacySkuCell from "./LegacySkuCell";

export const dynamic = "force-dynamic";

async function getItems() {
  return db.select().from(items).orderBy(items.sku);
}

export default async function ItemsPage() {
  const itemRows = await getItems();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Items</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Product master data.
        </p>
      </header>

      <div className="mb-8">
        <CreateItemForm />
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Legacy SKU</th>
              <th className="px-4 py-3 font-medium">Current SKU</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-right">Bags / Carton</th>
              <th className="px-4 py-3 font-medium text-right">Cartons / Pallet</th>
            </tr>
          </thead>
          <tbody>
            {itemRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                  No items yet.
                </td>
              </tr>
            ) : (
              itemRows.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {item.cartonBarcode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <LegacySkuCell itemId={item.id} initialValue={item.legacySku} />
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-500">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {item.cartonBagQty}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {item.palletCartonQty}
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