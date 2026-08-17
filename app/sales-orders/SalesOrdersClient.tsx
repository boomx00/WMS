"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ItemOption = { sku: string; name: string };

type PickSource = { locationCode: string; quantity: number; type: string };

type OrderLine = {
  quantity: number;
  itemSku: string;
  itemName: string;
  shipped: number;
  status: "PENDING" | "PICKING" | "SHIPPED";
  pickedFrom: PickSource[];
};

type Order = {
  id: number;
  soNumber: string;
  orderDate: string | Date;
  createdAt: string | Date;
  items: OrderLine[];
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-400",
  PICKING: "bg-amber-950 text-amber-300",
  SHIPPED: "bg-emerald-950 text-emerald-300",
};

export default function SalesOrdersClient({
  orders,
  allItems,
  page,
  totalPages,
  totalCount,
}: {
  orders: Order[];
  allItems: ItemOption[];
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const router = useRouter();

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

  return (
    <div>
      <div className="mb-8">
        <CreateSalesOrderForm allItems={allItems} />
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        Page {page} of {totalPages} · {totalCount.toLocaleString()} sales orders total
      </p>

      <div className="space-y-3 mb-4">
        {orders.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            No sales orders yet.
          </div>
        ) : (
          orders.map((order) => {
            const isOpen = expanded.has(order.id);
            const isEditing = editingId === order.id;

            return (
              <div
                key={order.id}
                className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden"
              >
                <div className="w-full flex items-center justify-between p-4">
                  <button
                    onClick={() => toggle(order.id)}
                    className="flex items-center gap-2 text-left flex-1"
                  >
                    <span
                      className={`text-zinc-500 text-xs transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                    <span className="font-mono text-amber-500 text-sm">{order.soNumber}</span>
                  </button>
                  <span className="text-xs text-zinc-500 mr-3">
                    {new Date(order.orderDate).toLocaleDateString()} · {order.items.length} item(s)
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(isEditing ? null : order.id);
                      if (!isOpen) toggle(order.id);
                    }}
                    className="text-xs text-amber-500 hover:underline"
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </button>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4">
                    {isEditing ? (
                      <EditSalesOrderForm
                        order={order}
                        allItems={allItems}
                        onDone={() => setEditingId(null)}
                      />
                    ) : (
                      <table className="w-full text-xs">
  <thead>
    <tr className="text-zinc-500 text-left border-t border-zinc-800 pt-2">
      <th className="py-2 font-medium">SKU</th>
      <th className="py-2 font-medium">Product</th>
      <th className="py-2 font-medium text-right">Ordered</th>
      <th className="py-2 font-medium text-right">Shipped</th>
      <th className="py-2 font-medium">Status</th>
      <th className="py-2 font-medium">Picked From</th>
    </tr>
  </thead>
  <tbody>
    {order.items.map((line, i) => (
      <tr key={i} className="border-t border-zinc-800/60">
        <td className="py-1.5 font-mono text-zinc-300">{line.itemSku}</td>
        <td className="py-1.5 text-zinc-500">{line.itemName}</td>
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
    const res = await fetch(`/api/sales-orders/${order.id}`, {
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
    <form onSubmit={handleSubmit} className="border-t border-zinc-800 pt-4 space-y-4">
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