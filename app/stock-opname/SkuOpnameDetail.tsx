"use client";

import { formatDateTime } from "@/lib/formatDateTime";

export type SkuDetailLine = {
  locationCode: string;
  systemQty: number;
  countedQty: number;
  difference: number;
  countedAt: string | null;
  countedByUsername: string | null;
};

export type SkuDetailEntry = {
  itemId: number;
  skuCode: string;
  skuName: string;
  systemQty: number; // locked at the moment the SKU was added to the session
  countedQty: number;
  difference: number;
  lines: SkuDetailLine[];
};

export type SkuDetailResponse = {
  opnameNumber: string;
  finished: boolean;
  skus: SkuDetailEntry[];
};

function MatchBadge({ difference }: { difference: number }) {
  if (difference === 0) {
    return <span className="text-emerald-400">Match</span>;
  }
  const sign = difference > 0 ? "+" : "";
  return (
    <span className={difference > 0 ? "text-amber-400" : "text-red-400"}>
      Not match <span className="font-mono">({sign}{difference.toLocaleString()})</span>
    </span>
  );
}

// Expanded view of a per-SKU (SOSKU-) session: one block per SKU showing its
// locked system quantity against the total counted, then each location that
// was counted with its system qty, counted qty, and whether they match.
export default function SkuOpnameDetail({ detail }: { detail: SkuDetailResponse }) {
  if (detail.skus.length === 0) {
    return <p className="text-xs text-zinc-600">No SKU has been added to this session yet.</p>;
  }

  return (
    <div className="space-y-4">
      {detail.skus.map((sku) => (
        <div key={sku.itemId} className="border border-zinc-800 rounded-md overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-3 py-2 bg-zinc-900/60">
            <div className="text-sm">
              <span className="font-mono text-amber-500">{sku.skuCode}</span>{" "}
              <span className="text-zinc-500">{sku.skuName}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>
                Locked qty: <span className="font-mono text-zinc-300">{sku.systemQty.toLocaleString()}</span>
              </span>
              <span>
                Stock opname qty: <span className="font-mono text-zinc-300">{sku.countedQty.toLocaleString()}</span>
              </span>
              <MatchBadge difference={sku.difference} />
            </div>
          </div>

          {sku.lines.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-600">No locations counted yet.</p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="py-2 px-3 font-medium">Location</th>
                  <th className="py-2 px-3 font-medium text-right">System qty</th>
                  <th className="py-2 px-3 font-medium text-right">Stock opname qty</th>
                  <th className="py-2 px-3 font-medium">Match</th>
                  <th className="py-2 px-3 font-medium">Counted at</th>
                </tr>
              </thead>
              <tbody>
                {sku.lines.map((line) => (
                  <tr
                    key={line.locationCode}
                    className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="py-1.5 px-3 font-mono text-amber-500">{line.locationCode}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                      {line.systemQty.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono">{line.countedQty.toLocaleString()}</td>
                    <td className="py-1.5 px-3">
                      <MatchBadge difference={line.difference} />
                    </td>
                    <td className="py-1.5 px-3 font-mono text-zinc-500 whitespace-nowrap">
                      {formatDateTime(line.countedAt)}
                      {line.countedByUsername ? ` · ${line.countedByUsername}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}