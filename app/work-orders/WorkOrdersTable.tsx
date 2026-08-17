"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Line = {
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
  totalQuantity: number;
  palletCount: number;
  originalInbound: number;
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
  totalOriginalInbound: number;
  pallets: Pallet[];
};
export default function WorkOrdersTable({
  workOrders,
  page,
  totalPages,
  totalCount,
}: {
  workOrders: WorkOrder[];
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();
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
      if (next.has(workOrderNumber)) next.delete(workOrderNumber);
      else next.add(workOrderNumber);
      return next;
    });
  }

  function goToPage(p: number) {
    router.push(`/work-orders?page=${p}`);
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter this page by work order or SKU..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-4 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        Page {page} of {totalPages} · {totalCount.toLocaleString()} work orders total
        {search.trim() && ` · ${filtered.length} matching on this page`}
      </p>

      <div className="space-y-3 mb-4">
        {filtered.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            No matching work orders on this page.
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
                  <span className="text-xs text-zinc-500 text-right">
  <div>
    {wo.totalPallets.toLocaleString()} pallet(s) ·{" "}
    <span className="text-zinc-300 font-mono">
      {wo.totalQuantity.toLocaleString()}
    </span>{" "}
    total units
  </div>
  <div className="text-zinc-600 text-[10px]">
    Originally inbounded: {wo.totalOriginalInbound.toLocaleString()}
  </div>
</span>
                </button>

               

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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}