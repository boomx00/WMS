"use client";

export function Delta({ value, muted = false }: { value: number; muted?: boolean }) {
  if (value === 0) return <span className={muted ? "text-zinc-600" : "text-emerald-500"}>0</span>;
  return (
    <span className={value > 0 ? "text-amber-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}
      {value.toLocaleString()}
    </span>
  );
}
