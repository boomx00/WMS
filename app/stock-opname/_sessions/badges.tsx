"use client";

// Small display pieces of the sessions list: status colours, tab button, system / difference cells.

export const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-400",
  IN_PROGRESS: "bg-amber-950 text-amber-300",
  DONE: "bg-emerald-950 text-emerald-300",
  CONFIRMED: "bg-blue-950 text-blue-300",
};

export function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? "border-amber-500 text-amber-500"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

export function CurrentSystemCell({ entries }: { entries: { sku: string; name: string; quantity: number }[] }) {
  if (entries.length === 0) {
    return <span className="text-zinc-700">—</span>;
  }
  return (
    <div className="space-y-0.5">
      {entries.map((e, i) => (
        <div key={i}>
          <span className="font-mono text-zinc-300">{e.sku}</span>{" "}
          <span className="text-zinc-500">{e.name}</span>
        </div>
      ))}
    </div>
  );
}

export function DifferenceBadge({ difference }: { difference: number }) {
  if (difference === 0) {
    return <span className="text-emerald-400 font-mono">Match</span>;
  }
  const sign = difference > 0 ? "+" : "";
  return (
    <span className={`font-mono ${difference > 0 ? "text-amber-400" : "text-red-400"}`}>
      {sign}
      {difference.toLocaleString()}
    </span>
  );
}
