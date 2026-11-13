import * as XLSX from "xlsx";
import type { CombineResponse, ReportRow, SkuSummaryRow } from "./types";
import { LOCATION_STATUS_LABELS, whoLabel } from "./calc";

// Excel export of the Combine CSO report: one sheet per tab, all rows, with
// the session picks made so far. The SKU sheet has the locations ticked.
export function exportCombineExcel(
  result: CombineResponse,
  rows: ReportRow[],
  skuRows: SkuSummaryRow[],
  excludedColumns: string[],
  summaryName?: string
) {
  // A packs location's quantities are loose packs: marked "(pk)".
  const packsColumns = new Set(result.columns.filter((c) => c.packs).map((c) => c.key));
  const locationSheet = rows.map((row) => ({
    Location: packsColumns.has(row.column) ? `${row.locationCode} (pk)` : row.locationCode,
    "System SKU": row.system?.sku ?? "",
    "Product Name": row.system?.name ?? "",
    "System Qty": row.system?.qty ?? "",
    "SO SKU": row.so?.sku ?? (row.emptyConfirmed ? "Empty" : ""),
    "PD Name": row.so?.name ?? "",
    "SO Qty": row.so?.qty ?? (row.emptyConfirmed ? 0 : ""),
    "CSO By":
      row.status === "UNDER_REVIEW" && row.choice
        ? row.choice.options.map((o) => `${whoLabel(o)}: ${o.detail}`).join(", ")
        : row.by.map(whoLabel).join(", "),
    Status: LOCATION_STATUS_LABELS[row.status],
  }));

  const columns = result.columns.filter((c) => !excludedColumns.includes(c.key));
  const skuSheet = skuRows.map((row) => {
    const out: Record<string, string | number> = { SKU: row.sku, Product: row.name };
    for (const c of columns) {
      const unit = c.packs ? " (pk)" : "";
      out[`${c.label} System${unit}`] = row.system[c.key] ?? 0;
      out[`${c.label} SO${unit}`] = row.so[c.key] ?? 0;
    }
    out["Total System"] = row.totalSystem;
    out["Total SO"] = row.totalSo;
    out.Difference = row.difference;
    if (result.k3) {
      out["K3 Good Stock"] = row.k3 ?? 0;
      out["Δ K3 (Total SO − K3)"] = row.k3Delta ?? 0;
    }
    out.Status = row.status;
    return out;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locationSheet), "Location Check");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skuSheet), "SKU Summary");
  // Named after the CSO Summary when there is one (characters Windows doesn't
  // allow in file names replaced).
  const prefix = summaryName
    ? summaryName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "combine-cso"
    : "combine-cso";
  XLSX.writeFile(wb, `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
