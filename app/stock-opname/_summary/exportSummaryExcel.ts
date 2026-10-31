import * as XLSX from "xlsx";
import type { Bucket, SummaryResponse } from "./types";
import { shownFigures, finalSoOf, round3, k3Of } from "./calc";
import { sheetName } from "./format";

// The summary's Export Excel button: the table as shown (picked columns,
// search / filters / sort applied), two header rows with each date merged
// over its columns.

type ExportArgs = {
  data: SummaryResponse;
  rows: SummaryResponse["items"];
  buckets: Bucket[];
  excludedKeys: string[];
  labels: Record<string, string>;
  hasK3: (date: string) => boolean;
  from: string;
  to: string;
};

export function exportSummaryExcel({ data, rows, buckets, excludedKeys, labels, hasK3, from, to }: ExportArgs) {
  const stockLabel = labels.summary_th_stock;
  const adjLabel = labels.summary_th_adjusted;
  const soskuLabel = labels.summary_th_sosku;
  const k3Label = labels.summary_th_k3;
  const k3DeltaLabel = labels.summary_th_k3_delta;
  const header1: (string | number)[] = [labels.summary_th_sku, labels.summary_th_product, stockLabel];
  const header2: (string | number)[] = ["", "", ""];
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
  ];
  if (buckets.length > 0) {
    for (const date of data.dates) {
      const start = header1.length;
      const width = buckets.length * 3 + 3 + (hasK3(date) ? 2 : 0) + 2;
      header1.push(date, ...Array(width - 1).fill(""));
      for (const b of buckets) {
        header2.push(`${b.name} ${labels.summary_system}`, `${b.name} ${labels.summary_so}`, labels.summary_delta);
      }
      header2.push(
        `${labels.report_th_reconciliation} ${labels.report_th_reconcile_plus}`,
        `${labels.report_th_reconciliation} ${labels.report_th_reconcile_minus}`,
        labels.report_th_final_so
      );
      if (hasK3(date)) header2.push(k3Label, k3DeltaLabel);
      header2.push(adjLabel, soskuLabel);
      merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + width - 1 } });
    }
  }
  // Same shape as the table: one row per SOSKU session on the product's
  // busiest day (SKU / name repeated on each, so the sheet stays sortable).
  const body = rows.flatMap((item) => {
    const height = Math.max(1, ...data.dates.map((date) => item.cells[date]?.length ?? 0));
    return Array.from({ length: height }, (_, k) => {
      const row: (string | number)[] = [item.sku, item.name, item.currentStock];
      for (const date of data.dates) {
        const cell = item.cells[date]?.[k];
        for (const b of buckets) {
          if (!cell) {
            row.push("", "", "");
          } else {
            const f = shownFigures(cell, b.key, excludedKeys);
            row.push(f.system, f.counted, f.counted - f.system);
          }
        }
        if (buckets.length > 0) {
          if (!cell) row.push("", "", "");
          else row.push(cell.reconciliation?.plus ?? 0, cell.reconciliation?.minus ?? 0, finalSoOf(cell, excludedKeys));
        }
        if (buckets.length > 0 && hasK3(date)) {
          // Blank for a session without K3 data.
          const k3 = cell ? k3Of(data, item, cell.opnameNumber) : null;
          if (!cell || !k3) {
            row.push("", "");
          } else {
            row.push(k3.qty, round3(finalSoOf(cell, excludedKeys) - k3.qty));
          }
        }
        if (buckets.length > 0) row.push(cell?.adjustment?.note ?? "", cell?.opnameNumber ?? "");
      }
      return row;
    });
  });
  const sheet = XLSX.utils.aoa_to_sheet([header1, header2, ...body]);
  sheet["!merges"] = merges;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName(labels.tab_summary));
  const range = from || to ? `-${from || "start"}_${to || "now"}` : "";
  XLSX.writeFile(book, `stock-opname-summary${range}.xlsx`, { bookType: "xlsx" });
}
