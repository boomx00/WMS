"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Supplier } from "./types";
import { inputClass } from "./shared";

// Manager: the supplier list — add, rename, switch Production / External,
// delete (only while no stock movement is recorded against it).
export function SuppliersPanel({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Supplier["kind"]>("EXTERNAL");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/suppliers", "POST", { name, kind })) setName("");
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm"
      >
        <span>
          Suppliers <span className="text-zinc-500">({suppliers.length})</span>
          <span className="ml-2 text-xs text-zinc-500">
            Production inbound from the PDA is recorded against the Production supplier automatically.
          </span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="text-zinc-500 text-left text-xs">
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium">Kind</th>
                <th className="py-1.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-zinc-800">
                  <td className="py-1.5">
                    {editing?.id === s.id ? (
                      <input
                        type="text"
                        value={editing.name}
                        autoFocus
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && (await call(`/api/suppliers/${s.id}`, "PATCH", { name: editing.name })))
                            setEditing(null);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-sm focus:outline-none"
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="py-1.5">
                    <select
                      value={s.kind}
                      disabled={busy}
                      onChange={(e) => call(`/api/suppliers/${s.id}`, "PATCH", { kind: e.target.value })}
                      className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      <option value="PRODUCTION" className="bg-zinc-900">Production</option>
                      <option value="EXTERNAL" className="bg-zinc-900">External</option>
                    </select>
                  </td>
                  <td className="py-1.5 text-right space-x-3 text-xs">
                    {editing?.id === s.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (await call(`/api/suppliers/${s.id}`, "PATCH", { name: editing.name })) setEditing(null);
                        }}
                        className="text-amber-500 hover:underline"
                      >
                        Save
                      </button>
                    ) : (
                      <button type="button" onClick={() => setEditing({ id: s.id, name: s.name })} className="text-amber-500 hover:underline">
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete supplier ${s.name}? Its products are left without a supplier.`))
                          call(`/api/suppliers/${s.id}`, "DELETE");
                      }}
                      className="text-red-400 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={add} className="flex flex-wrap gap-2 items-end max-w-2xl">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] text-zinc-500 mb-1">New supplier</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PT Contoh Packaging"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as Supplier["kind"])} className={inputClass}>
                <option value="EXTERNAL">External</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
            >
              Add supplier
            </button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
