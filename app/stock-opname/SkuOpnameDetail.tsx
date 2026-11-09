"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/formatDateTime";

export type SkuDetailLine = {
  locationCode: string;
  // "PACKS": a packs location — the line's quantities are loose packs.
  unit?: "CARTON" | "PACKS";
  // false: not counted in Total Stock — listed, but not in the SKU's totals.
  inTotalStock?: boolean;
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
  systemQty: number; // locked when the SKU was added — Total Stock locations only
  countedQty: number;
  difference: number;
  // Loose packs, on top of the cartons above (packs locations).
  systemPacks?: number;
  countedPacks?: number;
  differencePacks?: number;
  lines: SkuDetailLine[];
};

// A quantity with " pk" when it's loose packs.
const qty = (n: number, packs: boolean) => `${n.toLocaleString()}${packs ? " pk" : ""}`;

export type SkuDetailResponse = {
  opnameNumber: string;
  finished: boolean;
  skus: SkuDetailEntry[];
};

function MatchBadge({ difference, packs = false }: { difference: number; packs?: boolean }) {
  if (difference === 0) {
    return <span className="text-emerald-400">Match</span>;
  }
  const sign = difference > 0 ? "+" : "";
  return (
    <span className={difference > 0 ? "text-amber-400" : "text-red-400"}>
      Not match <span className="font-mono">({sign}{qty(difference, packs)})</span>
    </span>
  );
}

// Expanded view of a per-SKU (SOSKU-) session: one block per SKU showing its
// locked system quantity against the total counted, then each location that
// was counted with its system qty, counted qty, and whether they match.
// With onDelete (session not confirmed yet), each SKU has a Delete button
// that takes it out of the session with its counts; onDelete returns an
// error message when that fails.
export default function SkuOpnameDetail({
  detail,
  onDelete,
}: {
  detail: SkuDetailResponse;
  onDelete?: (sku: SkuDetailEntry) => Promise<string | null>;
}) {
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<{ itemId: number; message: string } | null>(null);

  async function remove(sku: SkuDetailEntry) {
    if (!onDelete) return;
    const counted = sku.lines.length > 0 ? ` and its ${sku.lines.length} counted location(s)` : "";
    if (!window.confirm(`Delete SKU ${sku.skuCode}${counted} from ${detail.opnameNumber}?`)) return;
    setDeleting(sku.itemId);
    setError(null);
    const message = await onDelete(sku);
    setDeleting(null);
    if (message) setError({ itemId: sku.itemId, message });
  }

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
                {(sku.systemPacks ?? 0) !== 0 && (
                  <span className="font-mono text-sky-300"> + {sku.systemPacks!.toLocaleString()} pk</span>
                )}
              </span>
              <span>
                Stock opname qty: <span className="font-mono text-zinc-300">{sku.countedQty.toLocaleString()}</span>
                {(sku.countedPacks ?? 0) !== 0 && (
                  <span className="font-mono text-sky-300"> + {sku.countedPacks!.toLocaleString()} pk</span>
                )}
              </span>
              <MatchBadge difference={sku.difference} />
              {(sku.systemPacks || sku.countedPacks) ? (
                <MatchBadge difference={sku.differencePacks ?? 0} packs />
              ) : null}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => remove(sku)}
                  disabled={deleting !== null}
                  className="text-red-400 hover:underline disabled:opacity-50"
                >
                  {deleting === sku.itemId ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          </div>
          {error?.itemId === sku.itemId && <p className="px-3 py-1 text-xs text-red-400">{error.message}</p>}

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
                    <td className="py-1.5 px-3 font-mono text-amber-500">
                      {line.locationCode}
                      {line.inTotalStock === false && (
                        <span className="ml-2 font-sans text-[10px] text-zinc-500">not in Total Stock</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                      {qty(line.systemQty, line.unit === "PACKS")}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono">{qty(line.countedQty, line.unit === "PACKS")}</td>
                    <td className="py-1.5 px-3">
                      <MatchBadge difference={line.difference} packs={line.unit === "PACKS"} />
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