"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ItemOption = { sku: string; name: string };

type PickSource = { locationCode: string; quantity: number; type: string; username: string };
type ShippedBy = { username: string; quantity: number };

type OrderLine = {
  quantity: number;
  itemSku: string;
  itemName: string;
  palletCartonQty: number;
  shipped: number;
  status: "PENDING" | "PICKING" | "SHIPPED";
  pickedFrom: PickSource[];
  shippedBy: ShippedBy[];
};

type Order = {
  id: number;
  soNumber: string;
  orderDate: string | Date;
  createdAt: string | Date;
  items: OrderLine[];
  overallStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED";
  pickedByUsers: string[];
  finishedAt: string | Date | null;
};

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
    <th className="px-4 py-3 font-medium w-32"></th>
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
  <td className="px-4 py-3 text-right">
  <FinishButton order={order} isAdmin={isAdmin} />
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
    {line.shipped.toLocaleString()}
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
                          )}
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

function CreateSalesOrderForm({ allItems }: { allItems: ItemOption[] }) {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<{ sku: string; quantity: string }[]>([
    { sku: "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateLine(index: number, field: "sku" | "quantity", value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { sku: "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validLines = lines.filter((l) => l.sku && l.quantity);
    if (validLines.length === 0) {
      setError("Add at least one item with a SKU and quantity");
      return;
    }

    const merged = new Map<string, number>();
    for (const l of validLines) {
      merged.set(l.sku, (merged.get(l.sku) ?? 0) + Number(l.quantity));
    }
    const mergedLines = Array.from(merged.entries()).map(([sku, quantity]) => ({ sku, quantity }));

    setLoading(true);
    const res = await fetch("/api/sales-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soNumber, orderDate, items: mergedLines }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create sales order");
      return;
    }

    setSuccess(`Created sales order ${soNumber}.`);
    setSoNumber("");
    setLines([{ sku: "", quantity: "" }]);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">SO Number</label>
          <input
            type="text"
            value={soNumber}
            onChange={(e) => setSoNumber(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Date</label>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-2">Items</label>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <ItemPicker
                allItems={allItems}
                value={line.sku}
                onChange={(sku) => updateLine(i, "sku", sku)}
              />
              <input
                type="number"
                min={1}
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
                className="w-24 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="px-3 text-zinc-500 hover:text-red-400 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 text-xs text-amber-500 hover:underline"
        >
          + Add item
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !soNumber}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating..." : "Create Sales Order"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </form>
  );
}

function EditSalesOrderForm({
  order,
  allItems,
  onDone,
}: {
  order: Order;
  allItems: ItemOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState(order.soNumber);
  const [orderDate, setOrderDate] = useState(
    new Date(order.orderDate).toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState(
    order.items.map((l) => ({ sku: l.itemSku, quantity: String(l.quantity) }))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateLine(index: number, field: "sku" | "quantity", value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { sku: "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validLines = lines.filter((l) => l.sku && l.quantity);
    if (validLines.length === 0) {
      setError("Add at least one item with a SKU and quantity");
      return;
    }

    const merged = new Map<string, number>();
    for (const l of validLines) {
      merged.set(l.sku, (merged.get(l.sku) ?? 0) + Number(l.quantity));
    }
    const mergedLines = Array.from(merged.entries()).map(([sku, quantity]) => ({ sku, quantity }));

    setLoading(true);
const res = await fetch(`/api/sales-orders/${order.soNumber}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ soNumber, orderDate, items: mergedLines }),
});
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update sales order");
      return;
    }

    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">SO Number</label>
          <input
            type="text"
            value={soNumber}
            onChange={(e) => setSoNumber(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Date</label>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-2">Items</label>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <ItemPicker
                allItems={allItems}
                value={line.sku}
                onChange={(sku) => updateLine(i, "sku", sku)}
              />
              <input
                type="number"
                min={1}
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
                className="w-24 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="px-3 text-zinc-500 hover:text-red-400 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 text-xs text-amber-500 hover:underline"
        >
          + Add item
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !soNumber}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-md border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-900 transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}

function ItemPicker({
  allItems,
  value,
  onChange,
}: {
  allItems: ItemOption[];
  value: string;
  onChange: (sku: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = allItems.find((item) => item.sku === value);

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.sku.toLowerCase().includes(query.toLowerCase()) ||
          item.name.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={open ? query : selected ? `${selected.sku} — ${selected.name}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Type SKU or name..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
      />

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-600">No matches</div>
          ) : (
            filtered.slice(0, 50).map((item) => (
              <button
                key={item.sku}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.sku);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors"
              >
                <span className="font-mono text-amber-500">{item.sku}</span>{" "}
                <span className="text-zinc-400">{item.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FinishButton({ order, isAdmin }: { order: Order; isAdmin: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${order.soNumber}/finish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to finish");
      return;
    }
    router.refresh();
  }

  async function handleUnfinish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${order.soNumber}/unfinish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to undo");
      return;
    }
    router.refresh();
  }

  if (order.finishedAt) {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300">
          Finished
        </span>
        {isAdmin && (
          <button
            onClick={handleUnfinish}
            disabled={loading}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            {loading ? "..." : "Undo"}
          </button>
        )}
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleFinish}
        disabled={loading}
        className="text-xs text-amber-500 hover:underline disabled:opacity-50"
      >
        {loading ? "..." : "Confirm Finish"}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}