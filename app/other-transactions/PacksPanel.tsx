"use client";

import { useEffect, useMemo, useState } from "react";

// Other Transactions → Packs: open defect cartons into loose packs (Unpack)
// and pack loose packs back into whole cartons (Repack). See
// app/api/other-transactions/packs/route.ts.

type Mode = "UNPACK" | "REPACK";

type Balance = {
  locationCode: string;
  itemSku: string;
  itemName: string;
  packsPerCarton: number;
  loosePacks: number;
};

type PackTransaction = {
  id: number;
  transactionCode: string;
  type: Mode;
  itemSku: string;
  itemName: string;
  cartonLocationCode: string;
  packLocationCode: string;
  cartons: number;
  packs: number;
  damagedPacks: number;
  packsPerCarton: number;
  notes: string | null;
  username: string;
  createdAt: string; // YYYY-MM-DD HH:MM, Asia/Jakarta
};

type PacksResponse = {
  packLocations: { code: string; warehouseId: number }[];
  balances: Balance[];
  transactions: PackTransaction[];
  page: number;
  totalPages: number;
};

type ItemMatch = { sku: string; name: string; cartonBagQty: number };

// Where Unpack takes cartons from by default.
const DEFAULT_UNPACK_FROM = "DEFECT";

const inputClass =
  "w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500";

export default function PacksPanel() {
  const [mode, setMode] = useState<Mode>("UNPACK");
  const [itemSku, setItemSku] = useState("");
  // The last SKU lookup and what it found; `item` only counts while it
  // still matches what's typed.
  const [lookup, setLookup] = useState<{ query: string; item: ItemMatch | null } | null>(null);
  const [cartonLocationCode, setCartonLocationCode] = useState(DEFAULT_UNPACK_FROM);
  const [packLocationCode, setPackLocationCode] = useState("");
  const [cartons, setCartons] = useState("1");
  const [goodPacks, setGoodPacks] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [data, setData] = useState<PacksResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/other-transactions/packs");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Resolve the typed SKU to its packs per carton.
  const typedSku = itemSku.trim();
  useEffect(() => {
    if (typedSku.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/items/search?q=${encodeURIComponent(typedSku)}`);
      if (!res.ok || cancelled) return;
      const rows: ItemMatch[] = await res.json();
      if (!cancelled) {
        setLookup({ query: typedSku, item: rows.find((r) => r.sku.toLowerCase() === typedSku.toLowerCase()) ?? null });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [typedSku]);
  const item = typedSku.length >= 2 && lookup?.query === typedSku ? lookup.item : null;

  const cartonCount = Number(cartons);
  const validCartons = Number.isInteger(cartonCount) && cartonCount > 0;
  const packsPerCarton = item?.cartonBagQty ?? 0;
  const totalPacks = validCartons && packsPerCarton > 0 ? cartonCount * packsPerCarton : null;
  const good = goodPacks.trim() === "" ? totalPacks : Number(goodPacks);
  const damaged = totalPacks !== null && good !== null && Number.isFinite(good) ? totalPacks - good : null;

  const packLocations = data?.packLocations ?? [];

  // Loose packs of the chosen SKU right now (all packs locations).
  const packsOnHand = useMemo(() => {
    if (!data || !item) return null;
    return data.balances
      .filter((b) => b.itemSku === item.sku && (!packLocationCode || b.locationCode === packLocationCode))
      .reduce((sum, b) => sum + b.loosePacks, 0);
  }, [data, item, packLocationCode]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setGoodPacks("");
    setCartonLocationCode(next === "UNPACK" ? DEFAULT_UNPACK_FROM : "");
  }

  // "Repack" on a loose-packs row: fill the form with as many whole cartons
  // as the packs make.
  function startRepack(b: Balance) {
    setMode("REPACK");
    setError(null);
    setSuccess(null);
    setItemSku(b.itemSku);
    setPackLocationCode(b.locationCode);
    setCartonLocationCode("");
    setCartons(String(Math.max(1, Math.floor(b.loosePacks / Math.max(1, b.packsPerCarton)))));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!itemSku.trim() || !cartonLocationCode.trim()) {
      setError(mode === "UNPACK" ? "Enter the SKU and the location the cartons come from" : "Enter the SKU and the location the cartons go to");
      return;
    }
    if (!validCartons) {
      setError("Cartons must be a whole number above 0");
      return;
    }
    if (mode === "UNPACK" && goodPacks.trim() !== "" && (!Number.isInteger(Number(goodPacks)) || Number(goodPacks) < 0)) {
      setError("Good packs must be a whole number, 0 or more");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/other-transactions/packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: mode,
        itemSku: itemSku.trim(),
        cartonLocationCode: cartonLocationCode.trim(),
        packLocationCode: packLocationCode || undefined,
        cartons: cartonCount,
        goodPacks: mode === "UNPACK" ? (good ?? undefined) : undefined,
        notes: notes.trim() || undefined,
      }),
    });
    setSubmitting(false);

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(result.error ?? "Failed to record");
      return;
    }

    setSuccess(
      mode === "UNPACK"
        ? `${result.transactionCode}: ${result.cartons} ctn out of ${result.cartonLocationCode}, ${result.packs} pk into ${result.packLocationCode}` +
            (result.damagedPacks > 0 ? `, ${result.damagedPacks} pk damaged` : "")
        : `${result.transactionCode}: ${result.packs} pk out of ${result.packLocationCode}, ${result.cartons} ctn into ${result.cartonLocationCode}`
    );
    setCartons("1");
    setGoodPacks("");
    setNotes("");
    refresh();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["UNPACK", "REPACK"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              mode === m
                ? "border-amber-500 bg-amber-500/10 text-amber-400"
                : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m === "UNPACK" ? "Unpack" : "Repack"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4 mb-8">
        <p className="text-xs text-zinc-500">
          {mode === "UNPACK"
            ? "Opens damaged cartons: the cartons leave their location, the good packs inside go to the packs location and the rest are written off."
            : "Packs loose packs back into whole cartons: the packs leave the packs location and the cartons go into the location you enter."}
        </p>

        {packLocations.length === 0 && !loading && (
          <p className="text-xs text-amber-400">
            No packs location yet. On the Locations page, add a location type with &quot;Counted in loose packs&quot;
            ticked, then a location of that type (e.g. PACKS).
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">SKU</label>
            <input
              type="text"
              value={itemSku}
              onChange={(e) => setItemSku(e.target.value)}
              placeholder="SKU"
              className={`${inputClass} font-mono`}
            />
            <p className="text-xs text-zinc-500 mt-1 min-h-4">
              {item ? (
                <>
                  {item.name} · <span className="text-zinc-300">{item.cartonBagQty} pk / ctn</span>
                  {packsOnHand !== null && (
                    <>
                      {" "}· <span className="text-zinc-300">{packsOnHand} loose pk</span> now
                    </>
                  )}
                </>
              ) : itemSku.trim().length >= 2 ? (
                "No exact SKU match yet"
              ) : null}
            </p>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              {mode === "UNPACK" ? "Cartons from (location)" : "Cartons to (location)"}
            </label>
            <input
              type="text"
              value={cartonLocationCode}
              onChange={(e) => setCartonLocationCode(e.target.value)}
              placeholder={mode === "UNPACK" ? DEFAULT_UNPACK_FROM : "e.g. FLOOR"}
              className={`${inputClass} font-mono`}
            />
          </div>

          {packLocations.length > 1 && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Packs location</label>
              <select
                value={packLocationCode}
                onChange={(e) => setPackLocationCode(e.target.value)}
                className={`${inputClass} font-mono`}
              >
                <option value="">Same warehouse as the cartons</option>
                {packLocations.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              {mode === "UNPACK" ? "Cartons opened" : "Cartons packed"}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={cartons}
              onChange={(e) => setCartons(e.target.value)}
              className={`${inputClass} font-mono`}
            />
            {mode === "REPACK" && totalPacks !== null && (
              <p className="text-xs text-zinc-500 mt-1">
                Uses <span className="text-zinc-300">{totalPacks} pk</span>
              </p>
            )}
          </div>

          {mode === "UNPACK" && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Good packs kept</label>
              <input
                type="number"
                min={0}
                step={1}
                value={goodPacks}
                onChange={(e) => setGoodPacks(e.target.value)}
                placeholder={totalPacks !== null ? String(totalPacks) : ""}
                className={`${inputClass} font-mono`}
              />
              {totalPacks !== null && damaged !== null && (
                <p className={`text-xs mt-1 ${damaged < 0 ? "text-red-400" : "text-zinc-500"}`}>
                  {damaged < 0
                    ? `More than the ${totalPacks} pk inside`
                    : `${totalPacks} pk inside · ${damaged} pk damaged (written off)`}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder={mode === "UNPACK" ? "e.g. carton crushed on the floor" : "e.g. new carton available"}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || packLocations.length === 0}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Recording..." : mode === "UNPACK" ? "Record Unpack" : "Record Repack"}
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">{success}</p>}
      </form>

      <h2 className="text-sm font-medium text-zinc-300 mb-2">Loose packs now</h2>
      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium text-right">Loose packs</th>
              <th className="px-4 py-3 font-medium text-right">In cartons</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                  Loading...
                </td>
              </tr>
            ) : (data?.balances ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                  No loose packs.
                </td>
              </tr>
            ) : (
              data!.balances.map((b) => {
                const perCarton = Math.max(1, b.packsPerCarton);
                const whole = Math.floor(b.loosePacks / perCarton);
                return (
                  <tr key={`${b.locationCode}|${b.itemSku}`} className="border-t border-zinc-800">
                    <td className="px-4 py-3">
                      <div className="font-mono">{b.itemSku}</div>
                      <div className="text-xs text-zinc-500">{b.itemName}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{b.locationCode}</td>
                    <td className="px-4 py-3 text-right font-mono">{b.loosePacks} pk</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-400">
                      {(b.loosePacks / perCarton).toFixed(3)}
                      <div className="text-xs text-zinc-600">{b.packsPerCarton} pk / ctn</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startRepack(b)}
                        disabled={whole === 0}
                        title={whole === 0 ? "Not enough packs for a whole carton" : `Up to ${whole} ctn`}
                        className="text-xs text-amber-500 hover:text-amber-400 disabled:text-zinc-700"
                      >
                        Repack
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-medium text-zinc-300 mb-2">History</h2>
      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Cartons</th>
              <th className="px-4 py-3 font-medium">Packs</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data?.transactions ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  {loading ? "Loading..." : "No unpacks or repacks yet."}
                </td>
              </tr>
            ) : (
              data!.transactions.map((t) => (
                <tr key={t.id} className="border-t border-zinc-800 align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-amber-400 whitespace-nowrap">{t.transactionCode}</div>
                    <div className={`text-xs ${t.type === "UNPACK" ? "text-rose-300" : "text-emerald-300"}`}>
                      {t.type === "UNPACK" ? "Unpack" : "Repack"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono whitespace-nowrap">{t.itemSku}</div>
                    <div className="text-xs text-zinc-500">{t.itemName}</div>
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {t.type === "UNPACK" ? "−" : "+"}
                    {t.cartons} ctn
                    <div className="text-xs text-zinc-500">
                      {t.type === "UNPACK" ? "from" : "to"} {t.cartonLocationCode}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {t.type === "UNPACK" ? "+" : "−"}
                    {t.packs} pk
                    <div className="text-xs text-zinc-500">
                      {t.type === "UNPACK" ? "to" : "from"} {t.packLocationCode}
                      {t.damagedPacks > 0 && <span className="text-rose-400"> · {t.damagedPacks} damaged</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{t.username}</td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{t.createdAt}</td>
                  <td className="px-4 py-3 text-zinc-500">{t.notes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
