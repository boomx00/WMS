"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TambahanPanel from "./TambahanPanel";
import CreateSalesOrderForm from "./components/CreateSalesOrderForm";
import EditSalesOrderForm from "./components/EditSalesOrderForm";
import ShippedCell from "./components/ShippedCell";
import type { ItemOption, Order } from "./components/types";
import { formatTruckTime } from "./components/helpers";
const OVERALL_STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: "bg-zinc-800 text-zinc-400",
  PARTIAL: "bg-amber-950 text-amber-300",
  COMPLETE: "bg-emerald-950 text-emerald-300",
};
const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-400",
  PICKING: "bg-amber-950 text-amber-300",
  SHIPPED: "bg-emerald-950 text-emerald-300",
};
type SortDirection = "asc" | "desc";

export default function SalesOrdersClient({
  orders,
  allItems,
  page,
  totalPages,
  totalCount,
  isAdmin,
}: {
  orders: Order[];
  allItems: ItemOption[];
  page: number;
  totalPages: number;
  totalCount: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Order[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/sales-orders/search?q=${encodeURIComponent(search.trim())}`);
      setSearching(false);
      if (res.ok) {
        setSearchResults(await res.json());
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [search]);

  function goToPage(p: number) {
    router.push(`/sales-orders?page=${p}`);
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort() {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const sortedOrders = useMemo(() => {
    const base = searchResults ?? orders;
    const copy = [...base];
    copy.sort((a, b) => {
      const cmp = a.soNumber.localeCompare(b.soNumber, undefined, { numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [orders, searchResults, sortDirection]);

  return (
    <div>
      <div className="mb-8">
        <CreateSalesOrderForm allItems={allItems} />
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by SO number..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-3 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : searchResults !== null
          ? `${sortedOrders.length.toLocaleString()} result(s) for "${search.trim()}"`
          : `Page ${page} of ${totalPages} · ${totalCount.toLocaleString()} sales orders total`}
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">
                <button
                  onClick={toggleSort}
                  className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                >
                  SO Number
                  <span className="text-[10px]">{sortDirection === "asc" ? "▲" : "▼"}</span>
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Picked By</th>
              <th className="px-4 py-3 font-medium text-right">Items</th>
              <th className="px-4 py-3 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  No sales orders yet.
                </td>
              </tr>
            ) : (
              sortedOrders.map((order) => {
                const isOpen = expanded.has(order.id);
                const isEditing = editingId === order.id;

                return (
                  <Fragment key={order.id}>
                    <tr
                      className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                      onClick={() => toggle(order.id)}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`text-zinc-500 text-xs transition-transform inline-block ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-500">{order.soNumber}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {new Date(order.orderDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${OVERALL_STATUS_STYLES[order.overallStatus]}`}
                        >
                          {order.overallStatus.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        {order.pickedByUsers.length === 0 ? "—" : order.pickedByUsers.join(", ")}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">{order.items.length}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(isEditing ? null : order.id);
                            if (!isOpen) toggle(order.id);
                          }}
                          className="text-xs text-amber-500 hover:underline"
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-zinc-800/60 bg-zinc-950/40">
                        <td colSpan={7} className="px-4 py-4">
                          {isEditing ? (
                            <EditSalesOrderForm
                              order={order}
                              allItems={allItems}
                              onDone={() => setEditingId(null)}
                            />
                          ) : (
                            <>
                                                        <div className="flex gap-6 mb-3 text-xs">
                              <div>
                                <span className="text-zinc-500">Truck Enter: </span>
                                <span className="text-zinc-300 font-mono">
                                  {formatTruckTime(order.truckEnterTime as string | null)}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-500">Truck Leave: </span>
                                <span className="text-zinc-300 font-mono">
                                  {formatTruckTime(order.truckLeaveTime as string | null)}
                                </span>
                              </div>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-zinc-500 text-left">
                                  <th className="py-2 font-medium">SKU</th>
                                  <th className="py-2 font-medium">Product</th>
                                  <th className="py-2 font-medium text-right">Carton/Pallet</th>
                                  <th className="py-2 font-medium text-right">Ordered</th>
                                  <th className="py-2 font-medium text-right">Shipped</th>
                                  <th className="py-2 font-medium">Status</th>
                                  <th className="py-2 font-medium">Picked From / By</th>
                                  <th className="py-2 font-medium">Shipped By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {order.items.map((line, i) => (
                                  <tr key={i} className="border-t border-zinc-800/60">
                                    <td className="py-1.5 font-mono text-zinc-300">{line.itemSku}</td>
                                    <td className="py-1.5 text-zinc-500">{line.itemName}</td>
                                    <td className="py-1.5 text-right font-mono text-zinc-400">
                                      {line.palletCartonQty.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-right font-mono">
                                      {line.quantity.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-right font-mono">
                                      <ShippedCell order={order} line={line} isAdmin={isAdmin} />
                                    </td>
                                    <td className="py-1.5">
                                      <span
                                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[line.status]}`}
                                      >
                                        {line.status}
                                      </span>
                                    </td>
                                    <td className="py-1.5">
                                      {line.pickedFrom.length === 0 ? (
                                        <span className="text-zinc-700">—</span>
                                      ) : (
                                        <div className="space-y-0.5">
                                          {line.pickedFrom.map((source, j) => (
                                            <div key={j} className="font-mono text-zinc-400">
                                              <span className="text-amber-500">{source.locationCode}</span>
                                              {" · "}
                                              {source.quantity.toLocaleString()}
                                              {source.type === "DEFAULT_PICKING" && (
                                                <span className="text-purple-400"> (default)</span>
                                              )}
                                              <span className="text-zinc-600"> — {source.username}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-1.5">
                                      {line.shippedBy.length === 0 ? (
                                        <span className="text-zinc-700">—</span>
                                      ) : (
                                        <div className="space-y-0.5">
                                          {line.shippedBy.map((s, j) => (
                                            <div key={j} className="font-mono text-zinc-400">
                                              {s.username} · {s.quantity.toLocaleString()}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </>
                          )}
                          <TambahanPanel soNumber={order.soNumber} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {searchResults === null && totalPages > 1 && (
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