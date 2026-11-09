"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { FeedbackBox } from "./FeedbackBox";

// System Control → Adjust Packs: set the loose packs of a SKU at a packs
// location directly (app/api/location-stock/adjust-packs). Carton stock is
// adjusted on the Adjust Location tab instead.

// Shown until these keys are added to the "scan" section of lib/pageLabels.ts.
const FALLBACK_LABELS = {
  adjust_packs_description:
    "Directly correct the loose packs of a SKU at a packs location — for count differences or entry mistakes. Logged as an ADJUSTMENT event in packs.",
  packs_location: "Packs location",
  corrected_packs: "Corrected Packs",
};

type Lookup = { packLocations: string[]; currentPacks: number | null; packsPerCarton: number | null };

const inputClass =
  "w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500";

export function AdjustPacksForm() {
  const router = useRouter();
  const labels = usePageLabels("scan", FALLBACK_LABELS);
  const [packLocations, setPackLocations] = useState<string[] | null>(null);
  const [locationCode, setLocationCode] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [newPacks, setNewPacks] = useState("");
  const [reason, setReason] = useState("");
  const [current, setCurrent] = useState<{ key: string; packs: number | null; packsPerCarton: number | null } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The packs locations; the only one is picked by default.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/location-stock/adjust-packs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Lookup | null) => {
        if (cancelled || !data) return;
        setPackLocations(data.packLocations);
        if (data.packLocations.length === 1) setLocationCode(data.packLocations[0]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Current loose packs for the chosen location + SKU.
  const sku = itemSku.trim();
  const lookupKey = `${locationCode}|${sku}|${refreshKey}`;
  useEffect(() => {
    if (!locationCode || sku.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ locationCode, itemSku: sku });
      const res = await fetch(`/api/location-stock/adjust-packs?${params}`);
      if (!res.ok || cancelled) return;
      const data: Lookup = await res.json();
      if (!cancelled) setCurrent({ key: lookupKey, packs: data.currentPacks, packsPerCarton: data.packsPerCarton });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locationCode, sku, lookupKey]);
  const shown = current?.key === lookupKey ? current : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/location-stock/adjust-packs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationCode,
        itemSku: sku,
        newPacks: Number(newPacks),
        reason: reason.trim(),
      }),
    });
    setLoading(false);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to adjust packs");
      return;
    }

    const sign = data.delta > 0 ? "+" : "";
    setSuccess(
      `Adjusted ${data.itemSku} at ${data.locationCode}: ${data.previousPacks} pk → ${data.newPacks} pk (${sign}${data.delta})`
    );
    setNewPacks("");
    setReason("");
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  const noPackLocations = packLocations !== null && packLocations.length === 0;

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">{labels.adjust_packs_description}</p>

      {noPackLocations && (
        <p className="text-xs text-amber-400">
          No packs location yet. On the Locations page, add a location type with &quot;Counted in loose packs&quot;
          ticked, then a location of that type (e.g. PACKS).
        </p>
      )}

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.packs_location}</label>
        <select
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          disabled={!packLocations || noPackLocations}
          className={inputClass}
        >
          {(packLocations?.length ?? 0) !== 1 && <option value="">—</option>}
          {(packLocations ?? []).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">SKU</label>
        <input type="text" value={itemSku} onChange={(e) => setItemSku(e.target.value)} className={inputClass} />
        <p className="text-xs text-zinc-500 mt-1 min-h-4">
          {shown &&
            (shown.packs === null ? (
              "Unknown SKU"
            ) : (
              <>
                Now <span className="text-zinc-300">{shown.packs} pk</span>
                {shown.packsPerCarton ? ` · ${shown.packsPerCarton} pk / ctn` : ""}
              </>
            ))}
        </p>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.corrected_packs}</label>
        <input
          type="number"
          min={0}
          step={1}
          value={newPacks}
          onChange={(e) => setNewPacks(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.reason}</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Physical recount, data entry error"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !locationCode || !sku || newPacks === ""}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adjusting..." : labels.apply_adjustment}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
