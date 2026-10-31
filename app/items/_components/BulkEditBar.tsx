"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Options } from "./types";
import { TYPE_LIST, BRAND_LIST, inputClass } from "./shared";
import { TagEditor } from "./TagEditor";

// Manager: change Type / Brand / tags of every ticked product at once.
export function BulkEditBar({
  ids,
  options,
  onClear,
}: {
  ids: number[];
  options: Options;
  onClear: () => void;
}) {
  const router = useRouter();
  const [productType, setProductType] = useState("");
  const [brand, setBrand] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply(change: Record<string, unknown>, label: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/items/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...change }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Failed to update" });
      return;
    }
    setMessage({ ok: true, text: `${label} — ${data.updated} product(s) updated.` });
    router.refresh();
  }

  const btn =
    "px-3 py-1.5 rounded-md border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap";

  return (
    <div className="border border-amber-900/60 bg-amber-950/10 rounded-lg p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-amber-300">{ids.length.toLocaleString()} product(s) selected</span>
        <button type="button" onClick={onClear} className="text-xs text-zinc-500 hover:text-zinc-200">
          Clear selection
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set type (empty clears it)</label>
          <div className="flex gap-2">
            <input
              type="text"
              list={TYPE_LIST}
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="e.g. Diapers"
              className={inputClass}
            />
            <button type="button" disabled={busy} className={btn} onClick={() => apply({ productType }, `Type set to "${productType.trim() || "—"}"`)}>
              Set type
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set brand (empty clears it)</label>
          <div className="flex gap-2">
            <input
              type="text"
              list={BRAND_LIST}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. MAKUKU"
              className={inputClass}
            />
            <button type="button" disabled={busy} className={btn} onClick={() => apply({ brand }, `Brand set to "${brand.trim() || "—"}"`)}>
              Set brand
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set supplier</label>
          <div className="flex gap-2">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">(no supplier)</option>
              {options.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              className={btn}
              onClick={() =>
                apply(
                  { supplierId: supplierId ? Number(supplierId) : null },
                  `Supplier set to "${options.suppliers.find((s) => String(s.id) === supplierId)?.name ?? "—"}"`
                )
              }
            >
              Set supplier
            </button>
          </div>
        </div>
        <div className="hidden lg:block" />
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Add tags (keeps their other tags)</label>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TagEditor value={addTags} onChange={setAddTags} suggestions={options.tags} placeholder="e.g. XL, 34+6" />
            </div>
            <button
              type="button"
              disabled={busy || addTags.length === 0}
              className={btn}
              onClick={() => apply({ addTags }, `Added ${addTags.join(", ")}`).then(() => setAddTags([]))}
            >
              Add tags
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Remove tags</label>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TagEditor value={removeTags} onChange={setRemoveTags} suggestions={options.tags} placeholder="Tags to take off" />
            </div>
            <button
              type="button"
              disabled={busy || removeTags.length === 0}
              className={btn}
              onClick={() => apply({ removeTags }, `Removed ${removeTags.join(", ")}`).then(() => setRemoveTags([]))}
            >
              Remove tags
            </button>
          </div>
        </div>
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>{message.text}</p>}
    </div>
  );
}
