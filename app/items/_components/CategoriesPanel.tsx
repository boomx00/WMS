"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Unit } from "./types";
import { inputClass } from "./shared";

type Draft = {
  name: string;
  primaryUnitId: string;
  secondaryUnitId: string;
  defaultRatio: string;
  storageUnitId: string;
  defaultStorageQty: string;
};

const emptyDraft: Draft = {
  name: "",
  primaryUnitId: "",
  secondaryUnitId: "",
  defaultRatio: "",
  storageUnitId: "",
  defaultStorageQty: "",
};

const s = (v: number | null) => (v === null ? "" : String(v));

const toDraft = (c: Category): Draft => ({
  name: c.name,
  primaryUnitId: s(c.primaryUnitId),
  secondaryUnitId: s(c.secondaryUnitId),
  defaultRatio: s(c.defaultRatio),
  storageUnitId: s(c.storageUnitId),
  defaultStorageQty: s(c.defaultStorageQty),
});

const payload = (d: Draft) => ({
  name: d.name,
  primaryUnitId: d.primaryUnitId ? Number(d.primaryUnitId) : null,
  secondaryUnitId: d.secondaryUnitId ? Number(d.secondaryUnitId) : null,
  defaultRatio: d.secondaryUnitId && d.defaultRatio ? Number(d.defaultRatio) : null,
  storageUnitId: d.storageUnitId ? Number(d.storageUnitId) : null,
  defaultStorageQty: d.storageUnitId && d.defaultStorageQty ? Number(d.defaultStorageQty) : null,
});

// A unit picker. Defined outside the panel so React keeps the same element
// between renders.
function UnitSelect({
  units,
  value,
  onChange,
  optional,
  disabled,
  className,
}: {
  units: Unit[];
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  disabled?: boolean;
  className: string;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{optional ? "(none)" : "Choose…"}</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.code})
        </option>
      ))}
    </select>
  );
}

// Manager: product categories and the units their products use —
//   primary   (e.g. Carton)  the main unit
//   secondary (e.g. Pack)    optional smaller unit; each product sets how
//                            many make one primary (default pre-filled)
//   storage   (e.g. Pallet)  optional unit of storage; each product sets how
//                            many primary units fill one (default pre-filled)
// Primary and secondary are fixed while the category has products.
export function CategoriesPanel({ categories, units }: { categories: Category[]; units: Unit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitName = (id: number | null) => (id === null ? null : units.find((u) => u.id === id)?.name ?? "?");

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
    if (await call("/api/product-categories", "POST", payload(draft))) setDraft(emptyDraft);
  }

  async function saveEdit(category: Category) {
    if (!editing) return;
    const body: Record<string, unknown> = payload(editing.draft);
    // Primary / secondary only sent when changed: the API refuses any change
    // to them while the category has products.
    if (body.primaryUnitId === category.primaryUnitId) delete body.primaryUnitId;
    if (body.secondaryUnitId === category.secondaryUnitId) delete body.secondaryUnitId;
    if (await call(`/api/product-categories/${category.id}`, "PATCH", body)) setEditing(null);
  }

  const small = "px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-sm focus:outline-none w-full";

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm"
      >
        <span>
          Product categories <span className="text-zinc-500">({categories.length})</span>
          <span className="ml-2 text-xs text-zinc-500">
            Which units each kind of product is counted and stored in.
          </span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <p className="text-xs text-zinc-500 max-w-3xl">
            <span className="text-zinc-300">Primary</span> is the main unit (e.g. Carton).{" "}
            <span className="text-zinc-300">Secondary</span> is an optional smaller unit (e.g. Pack) — each product says
            how many make one primary. <span className="text-zinc-300">Storage</span> is an optional unit of storage (e.g.
            Pallet) — each product says how many primary units fill one. Defaults pre-fill new products.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-left text-xs">
                  <th className="py-1.5 pr-2 font-medium">Name</th>
                  <th className="py-1.5 pr-2 font-medium">Primary</th>
                  <th className="py-1.5 pr-2 font-medium">Secondary</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Default ratio</th>
                  <th className="py-1.5 pr-2 font-medium">Storage</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Default per storage</th>
                  <th className="py-1.5 pr-2 font-medium text-right">Products</th>
                  <th className="py-1.5 w-32" />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const isEditing = editing?.id === c.id;
                  const locked = c.itemCount > 0;
                  if (isEditing) {
                    const d = editing.draft;
                    const set = (patch: Partial<Draft>) => setEditing({ id: c.id, draft: { ...d, ...patch } });
                    return (
                      <tr key={c.id} className="border-t border-zinc-800 align-top">
                        <td className="py-1.5 pr-2 min-w-[140px]">
                          <input type="text" value={d.name} onChange={(e) => set({ name: e.target.value })} className={small} />
                        </td>
                        <td className="py-1.5 pr-2 min-w-[130px]">
                          <UnitSelect
                            units={units}
                            value={d.primaryUnitId}
                            onChange={(v) => set({ primaryUnitId: v })}
                            disabled={locked}
                            className={small}
                          />
                        </td>
                        <td className="py-1.5 pr-2 min-w-[130px]">
                          <UnitSelect
                            units={units}
                            value={d.secondaryUnitId}
                            onChange={(v) => set({ secondaryUnitId: v })}
                            optional
                            disabled={locked}
                            className={small}
                          />
                        </td>
                        <td className="py-1.5 pr-2 w-24">
                          <input
                            type="number"
                            min={1}
                            value={d.defaultRatio}
                            disabled={!d.secondaryUnitId}
                            onChange={(e) => set({ defaultRatio: e.target.value })}
                            className={`${small} text-right font-mono disabled:opacity-40`}
                          />
                        </td>
                        <td className="py-1.5 pr-2 min-w-[130px]">
                          <UnitSelect
                            units={units}
                            value={d.storageUnitId}
                            onChange={(v) => set({ storageUnitId: v })}
                            optional
                            className={small}
                          />
                        </td>
                        <td className="py-1.5 pr-2 w-24">
                          <input
                            type="number"
                            min={1}
                            value={d.defaultStorageQty}
                            disabled={!d.storageUnitId}
                            onChange={(e) => set({ defaultStorageQty: e.target.value })}
                            className={`${small} text-right font-mono disabled:opacity-40`}
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-zinc-500">{c.itemCount}</td>
                        <td className="py-1.5 text-right space-x-3 text-xs whitespace-nowrap">
                          <button type="button" disabled={busy} onClick={() => saveEdit(c)} className="text-amber-500 hover:underline">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="text-zinc-500 hover:underline">
                            Cancel
                          </button>
                          {locked && (
                            <span className="block mt-1 text-[11px] text-zinc-600 whitespace-normal text-left">
                              Primary / secondary are fixed while it has products.
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={c.id} className="border-t border-zinc-800">
                      <td className="py-1.5 pr-2">{c.name}</td>
                      <td className="py-1.5 pr-2">{unitName(c.primaryUnitId)}</td>
                      <td className="py-1.5 pr-2 text-zinc-300">
                        {unitName(c.secondaryUnitId) ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-zinc-400">
                        {c.secondaryUnitId === null ? <span className="text-zinc-600">—</span> : (c.defaultRatio ?? "—")}
                      </td>
                      <td className="py-1.5 pr-2 text-zinc-300">
                        {unitName(c.storageUnitId) ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-zinc-400">
                        {c.storageUnitId === null ? <span className="text-zinc-600">—</span> : (c.defaultStorageQty ?? "—")}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono text-zinc-500">{c.itemCount}</td>
                      <td className="py-1.5 text-right space-x-3 text-xs whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditing({ id: c.id, draft: toDraft(c) })}
                          className="text-amber-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy || locked}
                          title={locked ? "Has products" : undefined}
                          onClick={() => {
                            if (window.confirm(`Delete category ${c.name}?`)) call(`/api/product-categories/${c.id}`, "DELETE");
                          }}
                          className="text-red-400 hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] text-zinc-500 mb-1">New category</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Raw Material"
                className={inputClass}
              />
            </div>
            <div className="w-40">
              <label className="block text-[11px] text-zinc-500 mb-1">Primary unit</label>
              <UnitSelect
                units={units}
                value={draft.primaryUnitId}
                onChange={(v) => setDraft({ ...draft, primaryUnitId: v })}
                className={inputClass}
              />
            </div>
            <div className="w-40">
              <label className="block text-[11px] text-zinc-500 mb-1">Secondary (optional)</label>
              <UnitSelect
                units={units}
                value={draft.secondaryUnitId}
                onChange={(v) => setDraft({ ...draft, secondaryUnitId: v })}
                optional
                className={inputClass}
              />
            </div>
            <div className="w-28">
              <label className="block text-[11px] text-zinc-500 mb-1">Default ratio</label>
              <input
                type="number"
                min={1}
                value={draft.defaultRatio}
                disabled={!draft.secondaryUnitId}
                onChange={(e) => setDraft({ ...draft, defaultRatio: e.target.value })}
                className={`${inputClass} font-mono disabled:opacity-40`}
              />
            </div>
            <div className="w-40">
              <label className="block text-[11px] text-zinc-500 mb-1">Storage (optional)</label>
              <UnitSelect
                units={units}
                value={draft.storageUnitId}
                onChange={(v) => setDraft({ ...draft, storageUnitId: v })}
                optional
                className={inputClass}
              />
            </div>
            <div className="w-28">
              <label className="block text-[11px] text-zinc-500 mb-1">Default per storage</label>
              <input
                type="number"
                min={1}
                value={draft.defaultStorageQty}
                disabled={!draft.storageUnitId}
                onChange={(e) => setDraft({ ...draft, defaultStorageQty: e.target.value })}
                className={`${inputClass} font-mono disabled:opacity-40`}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !draft.name.trim() || !draft.primaryUnitId}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
            >
              Add category
            </button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
