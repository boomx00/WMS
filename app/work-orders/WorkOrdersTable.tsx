"use client";

import { useMemo, useState } from "react";

type Line = {
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
  totalQuantity: number;
  palletCount: number;
};

type Pallet = {
  palletId: number;
  label: string;
  quantity: number;
  status: string;
  itemSku: string;
  locationCode: string;
  inboundAt: string | Date;
};

type WorkOrder = {
  workOrderNumber: string;
  lines: Line[];
  totalQuantity: number;
  totalPallets: number;
  pallets: Pallet[];
};

export default function WorkOrdersTable({ workOrders }: { workOrders: WorkOrder[] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workOrders;

    return workOrders.filter(
      (wo) =>
        wo.workOrderNumber.toLowerCase().includes(q) ||
        wo.lines.some(
          (l) =>
            l.itemSku.toLowerCase().includes(q) ||
            l.itemName.toLowerCase().includes(q)
        )
    );
  }, [workOrders, search]);

  function toggle(workOrderNumber: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workOrderNumber)) {
        next.delete(workOrderNumber);
      } else {
        next.add(workOrderNumber);
      }
      return next;
    });
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by work order or SKU..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-4 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {workOrders.length.toLocaleString()} work orders
      </p>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            No matching work orders.
          </div>
        ) : (
          filtered.map((wo) => {
            const isOpen = expanded.has(wo.workOrderNumber);

            return (
              <div
                key={wo.workOrderNumber}
                className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden"
              >
                <button
                  onClick={() => toggle(wo.workOrderNumber)}
                  className="w-full flex items-baseline justify-between p-4 text-left hover:bg-zinc-900/60 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-zinc-500 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    <span className="font-mono text-amber-500 text-sm">
                      {wo.workOrderNumber}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {wo.totalPallets.toLocaleString()} pallet(s) ·{" "}
                    <span className="text-zinc-300 font-mono">
                      {wo.totalQuantity.toLocaleString()}
                    </span>{" "}
                    total units
                  </span>
                </button>

                <div className="px-4 pb-3 space-y-1">
                  {wo.lines.map((line) => (
                    <div
                      key={line.itemSku}
                      className="flex items-center justify-between text-xs border-t border-zinc-800/60 pt-1"
                    >
                      <div>
                        <span className="font-mono text-zinc-300">{line.itemSku}</span>{" "}
                        <span className="text-zinc-500">{line.itemName}</span>
                      </div>
                      <div className="text-zinc-400 font-mono">
                        {line.totalQuantity.toLocaleString()} units ·{" "}
                        {line.palletCount} pallet(s)
                      </div>
                    </div>
                  ))}
                </div>

                {isOpen && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-500 text-left">
                          <th className="px-4 py-2 font-medium">Label</th>
                          <th className="px-4 py-2 font-medium">SKU</th>
                          <th className="px-4 py-2 font-medium text-right">Qty</th>
                          <th className="px-4 py-2 font-medium">Location</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 font-medium text-right">Inbound</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wo.pallets.map((p) => (
                          <tr key={p.palletId} className="border-t border-zinc-800/60">
                            <td className="px-4 py-2 font-mono text-zinc-400">{p.label}</td>
                            <td className="px-4 py-2 font-mono text-zinc-300">{p.itemSku}</td>
                            <td className="px-4 py-2 text-right font-mono">
                              {p.quantity.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 font-mono text-amber-500">
                              {p.locationCode}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                  p.status === "ACTIVE"
                                    ? "bg-emerald-950 text-emerald-300"
                                    : "bg-red-950 text-red-300"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-zinc-500">
                              {new Date(p.inboundAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}