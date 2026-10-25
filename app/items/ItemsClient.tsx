"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: number;
  sku: string;
  legacySku: string | null;
  cartonBarcode: string | null;
  name: string;
  cartonBagQty: number;
  palletCartonQty: number;
};

export default function ItemsClient({ items, isAdmin }: { items: Item[]; isAdmin: boolean }) {
  return (
    <div>
      {isAdmin && (
        <div className="mb-8">
          <CreateItemForm />
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Legacy SKU</th>
              <th className="px-4 py-3 font-medium">Current SKU</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-right">Bags / Carton</th>
              <th className="px-4 py-3 font-medium text-right">Cartons / Pallet</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                  No items yet.
                </td>
              </tr>
            ) : (
              items.map((item) => <ItemRow key={item.id} item={item} isAdmin={isAdmin} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRow({ item, isAdmin }: { item: Item; isAdmin: boolean }) {
  const router = useRouter();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(field: string, currentValue: string | number | null) {
    if (!isAdmin) return;
    setEditingField(field);
    setValue(currentValue?.toString() ?? "");
  }

  async function save(field: string) {
    setSaving(true);
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [field]: field === "cartonBagQty" || field === "palletCartonQty" ? Number(value) : value,
      }),
    });
    setSaving(false);
    setEditingField(null);
    router.refresh();
  }

  function EditableCell({
    field,
    displayValue,
    mono = true,
    numeric = false,
  }: {
    field: string;
    displayValue: string;
    mono?: boolean;
    numeric?: boolean;
  }) {
    if (editingField === field) {
      return (
        <div className="flex gap-1">
          <input
            type={numeric ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save(field);
              if (e.key === "Escape") setEditingField(null);
            }}
            className="w-24 px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-xs font-mono focus:outline-none"
          />
          <button onClick={() => save(field)} disabled={saving} className="text-xs text-amber-500 hover:underline">
            {saving ? "..." : "Save"}
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => startEdit(field, displayValue)}
        disabled={!isAdmin}
        className={`${mono ? "font-mono" : ""} text-left ${
          isAdmin ? "hover:text-amber-500 cursor-pointer" : "cursor-default"
        }`}
      >
        {displayValue || (isAdmin ? "— set —" : "—")}
      </button>
    );
  }

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
      <td className="px-4 py-3 font-mono text-zinc-400">
        <EditableCell field="cartonBarcode" displayValue={item.cartonBarcode ?? ""} />
      </td>
      <td className="px-4 py-3">
        <EditableCell field="legacySku" displayValue={item.legacySku ?? ""} />
      </td>
      <td className="px-4 py-3 font-mono text-amber-500">
        <EditableCell field="sku" displayValue={item.sku} />
      </td>
      <td className="px-4 py-3">
        <EditableCell field="name" displayValue={item.name} mono={false} />
      </td>
      <td className="px-4 py-3 text-right font-mono text-zinc-400">
        <EditableCell field="cartonBagQty" displayValue={item.cartonBagQty.toString()} numeric />
      </td>
      <td className="px-4 py-3 text-right font-mono text-zinc-400">
        <EditableCell field="palletCartonQty" displayValue={item.palletCartonQty.toString()} numeric />
      </td>
    </tr>
  );
}

function CreateItemForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [legacySku, setLegacySku] = useState("");
  const [cartonBarcode, setCartonBarcode] = useState("");
  const [name, setName] = useState("");
  const [cartonBagQty, setCartonBagQty] = useState("");
  const [palletCartonQty, setPalletCartonQty] = useState("");
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
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">SKU</label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Legacy Code (optional)</label>
          <input
            type="text"
            value={legacySku}
            onChange={(e) => setLegacySku(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Carton Barcode (optional)</label>
          <input
            type="text"
            value={cartonBarcode}
            onChange={(e) => setCartonBarcode(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Bags / Carton</label>
          <input
            type="number"
            min={1}
            value={cartonBagQty}
            onChange={(e) => setCartonBagQty(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
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
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
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