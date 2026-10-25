"use client";

type Row = {
  palletId: number;
  label: string;
  quantity: number;
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
  intendedLocationCode: string;
  createdAt: string | Date;
};

export default function PendingTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-16 text-center">
        <p className="text-zinc-400">Nothing pending confirmation.</p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-900 text-zinc-500 text-left">
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium text-right">Qty</th>
            <th className="px-4 py-3 font-medium">Intended Location</th>
            <th className="px-4 py-3 font-medium text-right">Created</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.palletId} className="border-t border-zinc-800 hover:bg-zinc-900/50">
              <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{row.label}</td>
              <td className="px-4 py-3">
                <span className="font-mono text-zinc-300">{row.itemSku}</span>{" "}
                <span className="text-zinc-500 text-xs">{row.itemName}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
              <td className="px-4 py-3 font-mono text-amber-500">{row.intendedLocationCode}</td>
              <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                {new Date(row.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <a
                  href={`/pallets/print/${encodeURIComponent(row.label)}`}
                  target="_blank"
                  className="text-xs text-amber-500 hover:underline whitespace-nowrap"
                >
                  Print Label
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}