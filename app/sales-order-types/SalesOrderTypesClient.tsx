"use client";

import { useState } from "react";
import { useCan } from "@/lib/AccessContext";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SO_TYPE_SALES_PAGE_LABELS } from "@/lib/salesOrderTypeLabels";

type TypeRow = {
  id: number;
  name: string;
  description: string | null;
  numberPrefix: string | null;
  orderCount: number;
};

export default function SalesOrderTypesClient({ initialTypes }: { initialTypes: TypeRow[] }) {
  const can = useCan();
  const readOnly = !can("so.types");
  const labels = usePageLabels("sales_page", SO_TYPE_SALES_PAGE_LABELS);

  const [types, setTypes] = useState<TypeRow[]>(initialTypes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrefix, setEditPrefix] = useState("");

  async function load() {
    const res = await fetch("/api/sales-order-types");
    if (!res.ok) {
      setError("Failed to load types");
      return;
    }
    setTypes(await res.json());
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
      fetch("/api/sales-order-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDescription, numberPrefix: newPrefix }),
      })
    );
    if (ok) {
      setNewName("");
      setNewDescription("");
      setNewPrefix("");
    }
  }

  function startEdit(type: TypeRow) {
    setEditingId(type.id);
    setEditName(type.name);
    setEditDescription(type.description ?? "");
    setEditPrefix(type.numberPrefix ?? "");
    setError(null);
  }

  async function handleSave(id: number) {
    if (!editName.trim()) return;
    const ok = await run(
      fetch(`/api/sales-order-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDescription, numberPrefix: editPrefix }),
      })
    );
    if (ok) setEditingId(null);
  }

  async function handleDelete(type: TypeRow) {
    if (!window.confirm(labels.type_confirm_delete.replace("{name}", type.name))) return;
    await run(fetch(`/api/sales-order-types/${type.id}`, { method: "DELETE" }));
  }

  const input =
    "px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600";
  const small =
    "px-2 py-1 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.types_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">{labels.types_description}</p>
      </header>

      <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
        {readOnly ? (
          <p className="text-xs text-zinc-500 mb-4">{labels.types_read_only}</p>
        ) : (
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={labels.type_name}
              aria-label={labels.type_name}
              className={`w-32 font-mono ${input}`}
            />
            <input
              type="text"
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              placeholder={labels.type_number_prefix_placeholder}
              aria-label={labels.type_number_prefix}
              className={`w-40 font-mono ${input}`}
            />
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder={labels.type_description}
              aria-label={labels.type_description}
              className={`flex-1 min-w-48 ${input}`}
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {labels.add_type}
            </button>
          </form>
        )}

        {!readOnly && <p className="text-xs text-zinc-600 -mt-2 mb-4">{labels.type_number_prefix_hint}</p>}
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {types.length === 0 ? (
          <p className="text-xs text-zinc-600">{labels.types_empty}</p>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-3 py-2 font-medium">{labels.type_name}</th>
                  <th className="px-3 py-2 font-medium">{labels.type_number_prefix}</th>
                  <th className="px-3 py-2 font-medium">{labels.type_description}</th>
                  <th className="px-3 py-2 font-medium text-right">{labels.type_orders}</th>
                  {!readOnly && <th className="px-3 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id} className="border-t border-zinc-800/60">
                    {editingId === type.id ? (
                      <td className="px-3 py-2" colSpan={3}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSave(type.id);
                          }}
                          className="flex flex-wrap gap-2"
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            aria-label={labels.type_name}
                            className="w-28 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            value={editPrefix}
                            onChange={(e) => setEditPrefix(e.target.value)}
                            placeholder={labels.type_number_prefix_placeholder}
                            aria-label={labels.type_number_prefix}
                            className="w-36 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
                          />
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder={labels.type_description}
                            aria-label={labels.type_description}
                            className="flex-1 min-w-40 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
                          />
                          <button type="submit" disabled={busy || !editName.trim()} className={small}>
                            {busy ? labels.saving : labels.save_changes}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className={small}>
                            {labels.cancel}
                          </button>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-mono text-amber-500">{type.name}</td>
                        <td className="px-3 py-2 font-mono text-zinc-300 whitespace-pre">
                          {type.numberPrefix ?? <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {type.description ?? <span className="text-zinc-700">—</span>}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {type.orderCount.toLocaleString()}
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {editingId !== type.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(type)}
                              disabled={busy}
                              className={small}
                            >
                              {labels.edit}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(type)}
                              disabled={busy || type.orderCount > 0}
                              title={
                                type.orderCount > 0
                                  ? labels.type_in_use.replace("{n}", String(type.orderCount))
                                  : undefined
                              }
                              className={`ml-2 ${small} hover:text-red-400`}
                            >
                              {labels.delete}
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
