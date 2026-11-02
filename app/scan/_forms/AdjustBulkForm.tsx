"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

export type BulkAdjustment = {
  id: number;
  adjustmentCode: string;
  source: "SCAN" | "STOCK_OPNAME";
  description: string | null;
  opnameNumber: string | null;
  lineCount: number;
  createdAt: string;
  username: string | null;
};

export type BulkAdjustmentLine = {
  locationCode: string;
  itemSku: string;
  itemName: string | null;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
};

export function AdjustBulkForm() {
  const router = useRouter();
  const [rows, setRows] = useState([{ locationCode: "", itemSku: "", newQuantity: "" }]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ adjustmentCode: string; appliedCount: number; skippedCount: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [adjustments, setAdjustments] = useState<BulkAdjustment[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linesById, setLinesById] = useState<Record<number, BulkAdjustmentLine[]>>({});
  const [linesLoadingId, setLinesLoadingId] = useState<number | null>(null);
  const labels = usePageLabels("scan")
  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!linesById[id]) {
      setLinesLoadingId(id);
      const res = await fetch(`/api/bulk-adjustments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setLinesById((prev) => ({ ...prev, [id]: data.lines }));
      }
      setLinesLoadingId(null);
    }
  }
  async function refreshList() {
    setListLoading(true);
    const res = await fetch("/api/bulk-adjustments");
    if (res.ok) setAdjustments(await res.json());
    setListLoading(false);
  }

  useEffect(() => {
    refreshList();
  }, []);

  function updateRow(index: number, field: "locationCode" | "itemSku" | "newQuantity", value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { locationCode: "", itemSku: "", newQuantity: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const lines = rows
      .map((r) => ({
        locationCode: r.locationCode.trim(),
        itemSku: r.itemSku.trim(),
        newQuantity: Number(r.newQuantity),
      }))
      .filter((r) => r.locationCode || r.itemSku || r.newQuantity);

    if (lines.length === 0) {
      setError("Add at least one row");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/bulk-adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, description: description.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to apply bulk adjustment");
      return;
    }

    const data = await res.json();
    setResult({ adjustmentCode: data.adjustmentCode, appliedCount: data.appliedCount, skippedCount: data.skippedCount });
    setRows([{ locationCode: "", itemSku: "", newQuantity: "" }]);
    setDescription("");
    router.refresh();
    await refreshList();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
        <p className="text-xs text-zinc-500">
         {labels.bulk_adjustment_description}
        </p>

        <div className="space-y-2">
          {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-end">
  <label className="flex-1 flex flex-col gap-1">
    <span className="text-xs text-zinc-500">{labels.location}</span>
    <input
      type="text"
      value={row.locationCode}
      onChange={(e) => updateRow(i, "locationCode", e.target.value)}
      placeholder="Floor, A.1.1 - H.16.1"
      className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
    />
  </label>
  <label className="flex-1 flex flex-col gap-1">
    <span className="text-xs text-zinc-500">SKU</span>
    <input
      type="text"
      value={row.itemSku}
      onChange={(e) => updateRow(i, "itemSku", e.target.value)}
      placeholder="123123123"
      className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
    />
  </label>
  <label className="w-28 flex flex-col gap-1">
    <span className="text-xs text-zinc-500">{labels.quantity}</span>
    <input
      type="number"
      value={row.newQuantity}
      onChange={(e) => updateRow(i, "newQuantity", e.target.value)}
      placeholder=""
      min={0}
      className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
    />
  </label>
  <button
    type="button"
    onClick={() => removeRow(i)}
    disabled={rows.length === 1}
    className="text-zinc-600 hover:text-red-400 disabled:opacity-30 text-sm px-2 py-2"
  >
    ✕
  </button>
</div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="text-xs text-amber-500 hover:text-amber-400">
          + {labels.add_row}
        </button>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.description}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Applying..." : labels.apply_bulk_adjustment}
        </button>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mt-4">{error}</p>
        )}
        {result && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mt-4">
            Adjustment <span className="font-mono">{result.adjustmentCode}</span> applied — {result.appliedCount} line(s)
            changed, {result.skippedCount} already matched.
          </p>
        )}
      </form>

           <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">{labels.bulk_adjustments_list}</h3>
          {listLoading && <span className="text-xs text-zinc-600">Loading...</span>}
        </div>
        {adjustments.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">No bulk adjustments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 text-xs border-b border-zinc-800">
                <th className="py-2 px-4"></th>
                <th className="py-2 px-4">{labels.th_id}</th>
                {/* <th className="py-2 px-4">Source</th> */}
                <th className="py-2 px-4">{labels.th_description}</th>
                <th className="py-2 px-4 text-right">{labels.th_lines}</th>
                <th className="py-2 px-4">{labels.th_by}</th>
                <th className="py-2 px-4">{labels.th_created}</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <>
                  <tr
                    key={a.id}
                    onClick={() => toggleExpand(a.id)}
                    className="border-b border-zinc-900 last:border-0 cursor-pointer hover:bg-zinc-900/60"
                  >
                    <td className="py-2 px-4 text-zinc-600 text-xs w-6">
                      <span className={`inline-block transition-transform ${expandedId === a.id ? "rotate-90" : ""}`}>▶</span>
                    </td>
                    <td className="py-2 px-4 font-mono text-amber-500">{a.adjustmentCode}</td>
                    {/* <td className="py-2 px-4 text-zinc-400">
                      {a.source === "STOCK_OPNAME" ? `Stock Opname${a.opnameNumber ? ` (${a.opnameNumber})` : ""}` : "Scan"}
                    </td> */}
                    <td className="py-2 px-4 text-zinc-400">{a.description || "—"}</td>
                    <td className="py-2 px-4 text-right font-mono">{a.lineCount}</td>
                    <td className="py-2 px-4 text-zinc-500">{a.username ?? "—"}</td>
                    <td className="py-2 px-4 text-zinc-500">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                  {expandedId === a.id && (
                    <tr key={`${a.id}-detail`} className="border-b border-zinc-900 last:border-0">
                      <td colSpan={7} className="px-4 py-3 bg-zinc-950/50">
                        {linesLoadingId === a.id ? (
                          <p className="text-xs text-zinc-600">Loading details...</p>
                        ) : !linesById[a.id] || linesById[a.id].length === 0 ? (
                          <p className="text-xs text-zinc-600">No lines were changed in this adjustment.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-zinc-600 border-b border-zinc-800">
                                <th className="py-1.5 pr-4">{labels.location}</th>
                                <th className="py-1.5 pr-4">SKU</th>
                                <th className="py-1.5 pr-4">{labels.th_product}</th>
                                <th className="py-1.5 pr-4 text-right">{labels.th_previous}</th>
                                <th className="py-1.5 pr-4 text-right">{labels.th_new}</th>
                                <th className="py-1.5 pr-4 text-right">{labels.th_delta}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linesById[a.id].map((l, i) => (
                                <tr key={i} className="border-b border-zinc-900 last:border-0">
                                  <td className="py-1.5 pr-4 font-mono text-zinc-300">{l.locationCode}</td>
                                  <td className="py-1.5 pr-4 font-mono text-zinc-300">{l.itemSku}</td>
                                  <td className="py-1.5 pr-4 text-zinc-500">{l.itemName ?? "—"}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-zinc-400">{l.previousQuantity.toLocaleString()}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-zinc-300">{l.newQuantity.toLocaleString()}</td>
                                  <td className={`py-1.5 pr-4 text-right font-mono ${l.delta > 0 ? "text-amber-400" : "text-red-400"}`}>
                                    {l.delta > 0 ? "+" : ""}
                                    {l.delta.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
