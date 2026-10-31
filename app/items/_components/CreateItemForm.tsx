"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Options } from "./types";
import { KIND_LABEL, TYPE_LIST, BRAND_LIST, inputClass } from "./shared";
import { TagEditor } from "./TagEditor";

export function CreateItemForm({ options }: { options: Options }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [legacySku, setLegacySku] = useState("");
  const [cartonBarcode, setCartonBarcode] = useState("");
  const [name, setName] = useState("");
  const [cartonBagQty, setCartonBagQty] = useState("");
  const [palletCartonQty, setPalletCartonQty] = useState("");
  const [productType, setProductType] = useState("");
  const [brand, setBrand] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        name,
        cartonBagQty: Number(cartonBagQty),
        palletCartonQty: Number(palletCartonQty),
        legacySku: legacySku.trim() || undefined,
        cartonBarcode: cartonBarcode.trim() || undefined,
        productType,
        brand,
        tags,
        supplierId: supplierId ? Number(supplierId) : null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create item");
      return;
    }

    setSuccess(`Created item ${sku}.`);
    setSku("");
    setLegacySku("");
    setCartonBarcode("");
    setName("");
    setCartonBagQty("");
    setPalletCartonQty("");
    // Type, brand and supplier stay filled in: the next product is usually the same.
    setTags([]);
    router.refresh();
  }

  const input = `${inputClass} font-mono`;

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">SKU</label>
          <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={input} required />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Legacy Code (optional)</label>
          <input type="text" value={legacySku} onChange={(e) => setLegacySku(e.target.value)} className={input} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Carton Barcode (optional)</label>
          <input type="text" value={cartonBarcode} onChange={(e) => setCartonBarcode(e.target.value)} className={input} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Type (optional)</label>
          <input
            type="text"
            list={TYPE_LIST}
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            placeholder="e.g. Diapers"
            className={inputClass}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Brand (optional)</label>
          <input
            type="text"
            list={BRAND_LIST}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. MAKUKU"
            className={inputClass}
          />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="block text-xs text-zinc-500 mb-1">Tags (optional)</label>
          <TagEditor value={tags} onChange={setTags} suggestions={options.tags} placeholder="e.g. XL, 34+6" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-zinc-500 mb-1">Supplier (optional)</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {options.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({KIND_LABEL[s.kind]})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Bags / Carton</label>
          <input
            type="number"
            min={1}
            value={cartonBagQty}
            onChange={(e) => setCartonBagQty(e.target.value)}
            className={input}
            required
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Cartons / Pallet</label>
          <input
            type="number"
            min={1}
            value={palletCartonQty}
            onChange={(e) => setPalletCartonQty(e.target.value)}
            className={input}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !sku || !name || !cartonBagQty || !palletCartonQty}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating..." : "Create Item"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </form>
  );
}
