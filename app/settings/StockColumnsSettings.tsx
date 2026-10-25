"use client";

import { useEffect, useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SETTINGS_WAREHOUSE_LABELS } from "@/lib/warehouseLabels";

type Column = { id: number; name: string; sortOrder: number; locationCount: number };
type WarehouseOption = { id: number; name: string; isActive: boolean };

// Settings → Total Stock Columns: the columns of one warehouse's Total
// Stock tab (and the sections of its per-SKU ledger), in display order —
// the warehouse is chosen at the top. Each location picks one of its
// warehouse's columns as "Shown under" on the Locations page.
export default function StockColumnsSettings({
  readOnly = false,
  warehouses,
}: {
  readOnly?: boolean;
  warehouses: WarehouseOption[];
}) {
  const labels = usePageLabels("settings_page", SETTINGS_WAREHOUSE_LABELS);
  const [warehouseId, setWarehouseId] = useState<number | null>(warehouses[0]?.id ?? null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    setEditingId(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  async function load() {
    if (warehouseId === null) {
      setColumns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/stock-columns?warehouseId=${warehouseId}`);
    setLoading(false);
    if (!res.ok) {
      setError("Failed to load columns");
      return;
    }
    setColumns(await res.json());
  }

  // Runs a change, shows its error if any, then reloads the list.
  async function run(request: Promise<Response>) {
    setBusy(true);
    setError(null);
    const res = await request;
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Failed (${res.status})`);
      return false;
    }
    await load();
    return true;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await run(
      fetch("/api/stock-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), warehouseId }),
      })
    );
    if (ok) setNewName("");
  }

  async function handleRename(id: number) {
    const ok = await run(
      fetch(`/api/stock-columns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      })
    );
    if (ok) setEditingId(null);
  }

  // A column that locations show under can still be deleted: they're set
  // to "Total only" (counted in the total, under no column).
  async function handleDelete(column: Column) {
    const message =
      column.locationCount > 0
        ? labels.stock_column_confirm_delete_used
            .replace("{name}", column.name)
            .replace("{n}", String(column.locationCount))
        : labels.stock_column_confirm_delete.replace("{name}", column.name);
    if (!window.confirm(message)) return;
    await run(fetch(`/api/stock-columns/${column.id}?force=true`, { method: "DELETE" }));
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const ids = columns.map((c) => c.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run(
      fetch("/api/stock-columns/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, warehouseId }),
      })
    );
  }

  const small =
    "px-2 py-1 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">{labels.stock_columns}</h2>
      <p className="text-xs text-zinc-500 mb-4">{labels.stock_columns_description}</p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label htmlFor="stock-columns-warehouse" className="text-xs text-zinc-400">
          {labels.stock_columns_warehouse}
        </label>
        <select
          id="stock-columns-warehouse"
          value={warehouseId ?? ""}
          onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-60 min-w-48"
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.isActive ? w.name : `${w.name} ${labels.warehouse_inactive_suffix}`}
            </option>
          ))}
        </select>
      </div>

      {!readOnly && (
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={labels.stock_column_name}
            className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {labels.stock_column_add}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : columns.length === 0 ? (
        <p className="text-xs text-zinc-600">{labels.stock_column_none}</p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-3 py-2 font-medium w-12">#</th>
                <th className="px-3 py-2 font-medium">{labels.stock_column_name}</th>
                <th className="px-3 py-2 font-medium text-right">{labels.stock_column_locations}</th>
                {!readOnly && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {columns.map((column, index) => (
                <tr key={column.id} className="border-t border-zinc-800/60">
                  <td className="px-3 py-2 font-mono text-zinc-600">{index + 1}</td>
                  <td className="px-3 py-2">
                    {editingId === column.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRename(column.id);
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="flex-1 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
                        />
                        <button type="submit" disabled={busy || !editName.trim()} className={small}>
                          {labels.save}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className={small}>
                          {labels.cancel}
                        </button>
                      </form>
                    ) : (
                      <span className="text-zinc-200">{column.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {column.locationCount.toLocaleString()}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleMove(index, -1)}
                          disabled={busy || index === 0}
                          title={labels.stock_column_move_up}
                          aria-label={labels.stock_column_move_up}
                          className={small}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(index, 1)}
                          disabled={busy || index === columns.length - 1}
                          title={labels.stock_column_move_down}
                          aria-label={labels.stock_column_move_down}
                          className={small}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(column.id);
                            setEditName(column.name);
                          }}
                          disabled={busy}
                          className={small}
                        >
                          {labels.stock_column_rename}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(column)}
                          disabled={busy}
                          title={
                            column.locationCount > 0
                              ? labels.stock_column_in_use.replace("{n}", String(column.locationCount))
                              : undefined
                          }
                          className={`${small} hover:text-red-400`}
                        >
                          {labels.stock_column_delete}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
