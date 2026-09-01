"use client";

import { useState } from "react";

type ReportRow = {
  rowNumber: number;
  loc: string;
  kodeMaterial: string;
  skuAwal: string;
  systemSkuAtLocation: string | null;
  skuMatch: "MATCH" | "MISMATCH" | null;
  totalSystemInventory: number | null;
  palet: number | null;
  boxPerPalet: number | null;
  totalBox: number | null;
  systemQty: number | null;
  difference: number | null;
  status: "MATCH" | "MISMATCH" | "UNKNOWN_LOCATION" | "UNKNOWN_SKU" | "INVALID_ROW";
};

type Summary = {
  totalRows: number;
  matches: number;
  mismatches: number;
  unknownLocations: number;
  unknownSkus: number;
  invalidRows: number;
};

type VerifyResponse = { summary: Summary; report: ReportRow[] };

const STATUS_STYLES: Record<ReportRow["status"], string> = {
  MATCH: "bg-emerald-950 text-emerald-300",
  MISMATCH: "bg-amber-950 text-amber-300",
  UNKNOWN_LOCATION: "bg-red-950 text-red-300",
  UNKNOWN_SKU: "bg-red-950 text-red-300",
  INVALID_ROW: "bg-zinc-800 text-zinc-400",
};

const STATUS_LABELS: Record<ReportRow["status"], string> = {
  MATCH: "Match",
  MISMATCH: "Mismatch",
  UNKNOWN_LOCATION: "Unknown Location",
  UNKNOWN_SKU: "Unknown SKU",
  INVALID_ROW: "Invalid Row",
};

export default function VerifyStockIntegrityPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportRow["status"] | "ALL">("ALL");

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/stock-opname/verify-integrity", {
      method: "POST",
      body: formData,
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to verify file");
      return;
    }

    setResult(await res.json());
    setStatusFilter("ALL");
  }

  const filteredReport = result
    ? statusFilter === "ALL"
      ? result.report
      : result.report.filter((r) => r.status === statusFilter)
    : [];

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-4">
        Upload an Excel file with columns <span className="font-mono">LOC</span>,{" "}
        <span className="font-mono">Kode Material</span>, <span className="font-mono">SKU AWAL</span>,{" "}
        <span className="font-mono">PALET</span>, <span className="font-mono">BOX/PALET</span>, and{" "}
        <span className="font-mono">TOTAL BOX</span>. Kode Material and SKU Awal (from the file) sit on the
        left; System SKU — whatever the system actually has recorded at that location, independent of what
        the file claims — sits on the right, so you can see exactly what it's being checked against. TOTAL
        BOX is compared against the live system quantity for the matched item. A row marked "N/A" / "KOSONG"
        means that slot is genuinely empty in real life — it's still checked, against whether the system also
        shows zero stock at that location. This is a read-only check — nothing gets changed.
      </p>

      <div className="flex items-center gap-3 mb-6">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-zinc-400 file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-zinc-800 file:text-zinc-300 file:text-sm hover:file:bg-zinc-700"
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking..." : "Verify"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {result && (
        <div>
          <div className="flex gap-6 mb-5 flex-wrap">
            <SummaryStat label="Rows" value={result.summary.totalRows} />
            <SummaryStat label="Match" value={result.summary.matches} accent="text-emerald-400" />
            <SummaryStat label="Mismatch" value={result.summary.mismatches} accent="text-amber-400" />
            <SummaryStat
              label="Unknown Location"
              value={result.summary.unknownLocations}
              accent="text-red-400"
            />
            <SummaryStat label="Unknown SKU" value={result.summary.unknownSkus} accent="text-red-400" />
            {result.summary.invalidRows > 0 && (
              <SummaryStat label="Invalid Rows" value={result.summary.invalidRows} accent="text-zinc-500" />
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(["ALL", "MISMATCH", "UNKNOWN_LOCATION", "UNKNOWN_SKU", "MATCH", "INVALID_ROW"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
                    statusFilter === s
                      ? "bg-amber-500 text-zinc-950"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {s === "ALL" ? "All" : STATUS_LABELS[s]}
                </button>
              )
            )}
          </div>

          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">LOC</th>
                  <th className="px-3 py-2 font-medium">Kode Material</th>
                  <th className="px-3 py-2 font-medium">SKU Awal</th>
                  <th className="px-3 py-2 font-medium">System SKU</th>
                  <th className="px-3 py-2 font-medium">SKU Match</th>
                  <th className="px-3 py-2 font-medium text-right">Total System Inventory</th>
                  <th className="px-3 py-2 font-medium text-right">Palet</th>
                  <th className="px-3 py-2 font-medium text-right">Box/Palet</th>
                  <th className="px-3 py-2 font-medium text-right">Total Box (File)</th>
                  <th className="px-3 py-2 font-medium text-right">System Qty (This Location)</th>
                  <th className="px-3 py-2 font-medium text-right">Difference</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReport.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-6 text-center text-zinc-600">
                      No rows in this category.
                    </td>
                  </tr>
                ) : (
                  filteredReport.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-zinc-800/60">
                      <td className="px-3 py-1.5 text-zinc-600">{row.rowNumber}</td>
                      <td className="px-3 py-1.5 font-mono text-amber-500">{row.loc || "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-300">{row.kodeMaterial || "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-500">{row.skuAwal || "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-300">{row.systemSkuAtLocation ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        {row.skuMatch === null ? (
                          <span className="text-zinc-700">—</span>
                        ) : row.skuMatch === "MATCH" ? (
                          <span className="text-emerald-400">Match</span>
                        ) : (
                          <span className="text-red-400">Mismatch</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                        {row.totalSystemInventory ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{row.palet ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                        {row.boxPerPalet ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{row.totalBox ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                        {row.systemQty ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {row.difference === null ? (
                          "—"
                        ) : row.difference === 0 ? (
                          <span className="text-emerald-400">0</span>
                        ) : (
                          <span className={row.difference > 0 ? "text-amber-400" : "text-red-400"}>
                            {row.difference > 0 ? "+" : ""}
                            {row.difference}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[row.status]}`}
                        >
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold ${accent ?? "text-zinc-200"}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}