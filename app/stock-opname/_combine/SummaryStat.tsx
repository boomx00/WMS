export function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold ${accent ?? "text-zinc-200"}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
