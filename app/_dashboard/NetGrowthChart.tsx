"use client";

// Net Stock Growth on the Dashboard: the running total of (inbound −
// outbound) per office day as a line, with each day's net as bars in a
// strip underneath on the same days. Two panels rather than one chart with
// two y-scales — the running total quickly dwarfs any single day.

import { useEffect, useMemo, useRef, useState } from "react";
import type { NetGrowthData, NetGrowthPoint } from "@/lib/dashboard";

const RANGES = [7, 14, 30, 90] as const;
const DEFAULT_RANGE = 30;

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compact = (n: number) => compactFmt.format(n);

// "2026-11-18" → "18/11"
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Layout (px). The SVG is drawn at the container's real width so text never
// scales.
const PAD_L = 52;
const PAD_R = 16;
const TOP_Y = 10;
const TOP_H = 190; // cumulative line
const GAP = 40;
const BAR_H = 76; // daily net bars
const AXIS_H = 22;
const HEIGHT = TOP_Y + TOP_H + GAP + BAR_H + AXIS_H;
const BAR_Y = TOP_Y + TOP_H + GAP;
const TOOLTIP_W = 190;

// SVG colours are set as attributes, not Tailwind classes: an SVG shape with
// a missing class falls back to a black fill. Values are Tailwind v4's
// palette (sky-400, emerald-400, amber-500, zinc-*), same as the rest of the
// Dashboard.
const C = {
  line: "oklch(74.6% 0.16 232.661)", // sky-400
  in: "oklch(76.5% 0.177 163.223)", // emerald-400
  out: "oklch(76.9% 0.188 70.08)", // amber-500
  grid: "oklch(27.4% 0.006 286.033)", // zinc-800
  zero: "oklch(44.2% 0.017 285.786)", // zinc-600
  axis: "oklch(55.2% 0.016 285.938)", // zinc-500
  label: "oklch(96.7% 0.001 286.375)", // zinc-100
  surface: "oklch(14.1% 0.005 285.823)", // zinc-950
} as const;

// Round axis ticks covering [min, max] (0 always included).
function niceTicks(min: number, max: number, count: number): number[] {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) {
    lo = -1;
    hi = 1;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

type Result = { key: string; data: NetGrowthData | null; error: string | null };

export default function NetGrowthChart({
  endDate,
  refreshKey,
  labels,
}: {
  endDate: string; // the office day the Dashboard shows — the chart ends there
  refreshKey: string; // changes when the Dashboard reloads, so the chart does too
  labels: Record<string, string>;
}) {
  const [days, setDays] = useState<number>(DEFAULT_RANGE);
  const [result, setResult] = useState<Result | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const key = `${endDate}|${days}|${refreshKey}`;
  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const loadFailed = labels.growth_load_failed;

  // State is only set when the request settles, so the last chart stays up
  // (dimmed) while the next one loads.
  useEffect(() => {
    const ctrl = new AbortController();
    const url = `/api/dashboard/net-growth?end=${encodeURIComponent(endDate)}&days=${days}`;
    fetch(url, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? loadFailed);
        setResult({ key, data: body as NetGrowthData, error: null });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setResult((prev) => ({
          key,
          data: prev?.data ?? null,
          error: err instanceof Error ? err.message : loadFailed,
        }));
      });
    return () => ctrl.abort();
  }, [key, endDate, days, loadFailed]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => data?.points ?? [], [data]);
  const totals = useMemo(
    () =>
      points.reduce(
        (t, p) => ({ inbound: t.inbound + p.inbound, outbound: t.outbound + p.outbound }),
        { inbound: 0, outbound: 0 }
      ),
    [points]
  );
  const net = totals.inbound - totals.outbound;
  const isEmpty = data !== null && points.every((p) => p.inbound === 0 && p.outbound === 0);

  return (
    <div className="p-4">
      {/* Range · totals for the range · legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1" role="group">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setDays(n);
                setHover(null);
              }}
              aria-pressed={days === n}
              title={labels.growth_range_hint.replace("{n}", String(n))}
              className={`px-2 py-0.5 rounded-md border text-xs font-mono ${
                days === n
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {labels.growth_range.replace("{n}", String(n))}
            </button>
          ))}
          {data && (
            <span className="ml-2 text-xs text-zinc-600 font-mono">
              {shortDate(data.from)} → {shortDate(data.to)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-zinc-500">
            {labels.growth_inbound} <span className="font-mono text-emerald-400">{fmt(totals.inbound)}</span>
          </span>
          <span className="text-zinc-500">
            {labels.growth_outbound} <span className="font-mono text-amber-500">{fmt(totals.outbound)}</span>
          </span>
          <span className="text-zinc-500">
            {labels.growth_net} <span className="font-mono text-zinc-100 font-semibold">{signed(net)}</span>
          </span>
          <span className="flex items-center gap-3 sm:pl-3 sm:border-l border-zinc-800 text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: C.line }} aria-hidden />
              {labels.growth_cumulative}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex gap-0.5" aria-hidden>
                <span className="inline-block w-1.5 h-2.5 rounded-sm" style={{ background: C.in }} />
                <span className="inline-block w-1.5 h-2.5 rounded-sm" style={{ background: C.out }} />
              </span>
              {labels.growth_daily_net}
            </span>
          </span>
        </div>
      </div>

      {result?.error && <p className="text-xs text-red-400 mb-2">{result.error}</p>}

      <div
        ref={boxRef}
        className={loading && data ? "opacity-60 transition-opacity" : "transition-opacity"}
        // The tooltip is placed against this box; overflow hidden so nothing
        // inside can ever make the Dashboard panel scroll.
        style={{ position: "relative", height: HEIGHT, overflow: "hidden" }}
      >
        {!data ? (
          <div className="h-full rounded-md bg-zinc-900/40 animate-pulse" />
        ) : isEmpty ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-600">{labels.growth_empty}</div>
        ) : (
          width > 0 && (
            <Plot
              points={points}
              width={width}
              hover={hover}
              onHover={setHover}
              labels={labels}
            />
          )
        )}
      </div>
    </div>
  );
}

function Plot({
  points,
  width,
  hover,
  onHover,
  labels,
}: {
  points: NetGrowthPoint[];
  width: number;
  hover: number | null;
  onHover: (i: number | null) => void;
  labels: Record<string, string>;
}) {
  const n = points.length;
  const plotW = Math.max(1, width - PAD_L - PAD_R);
  const band = plotW / n;
  const cx = (i: number) => PAD_L + band * (i + 0.5);

  // Cumulative panel
  const cumTicks = niceTicks(Math.min(...points.map((p) => p.cumulative)), Math.max(...points.map((p) => p.cumulative)), 4);
  const cLo = cumTicks[0];
  const cHi = cumTicks[cumTicks.length - 1];
  const cy = (v: number) => TOP_Y + ((cHi - v) / (cHi - cLo)) * TOP_H;

  // Daily net panel
  const netTicks = niceTicks(Math.min(...points.map((p) => p.net)), Math.max(...points.map((p) => p.net)), 2);
  const nLo = netTicks[0];
  const nHi = netTicks[netTicks.length - 1];
  const ny = (v: number) => BAR_Y + ((nHi - v) / (nHi - nLo)) * BAR_H;
  const barW = Math.min(28, Math.max(1, band - 2)); // 2px gap between bars

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${cy(p.cumulative).toFixed(1)}`).join("");
  const area = `${line}L${cx(n - 1).toFixed(1)},${cy(0).toFixed(1)}L${cx(0).toFixed(1)},${cy(0).toFixed(1)}Z`;

  // Date labels: as many as fit, always including the last day.
  const maxLabels = Math.max(2, Math.floor(plotW / 52));
  const step = Math.ceil(n / maxLabels);
  const labelled = points.map((_, i) => (n - 1 - i) % step === 0);

  const last = points[n - 1];
  const h = hover !== null ? points[hover] : null;
  const tipLeft =
    hover === null ? 0 : cx(hover) + 12 + TOOLTIP_W > width ? Math.max(0, cx(hover) - 12 - TOOLTIP_W) : cx(hover) + 12;

  return (
    <>
      <svg
        width={width}
        height={HEIGHT}
        className="block select-none"
        onMouseLeave={() => onHover(null)}
        role="img"
        aria-label={labels.growth_title}
      >
        {/* Cumulative: grid, zero line, area, line */}
        {cumTicks.map((t) => (
          <g key={`c${t}`}>
            <line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={cy(t)}
              y2={cy(t)}
              stroke={t === 0 ? C.zero : C.grid}
              strokeDasharray={t === 0 ? undefined : "2 4"}
            />
            <text x={PAD_L - 8} y={cy(t)} dy="0.32em" textAnchor="end" fill={C.axis} fontSize={10} className="font-mono">
              {compact(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={C.line} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={C.line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {n <= 31 &&
          points.map((p, i) => (
            <circle key={`d${p.date}`} cx={cx(i)} cy={cy(p.cumulative)} r={2} fill={C.line} />
          ))}
        {/* Direct label on the latest running total */}
        <circle cx={cx(n - 1)} cy={cy(last.cumulative)} r={4} fill={C.line} stroke={C.surface} strokeWidth={2} />
        <text
          x={cx(n - 1) - 8}
          y={cy(last.cumulative) + (last.cumulative >= 0 ? -10 : 16)}
          textAnchor="end"
          fill={C.label} fontSize={11} fontWeight={600} className="font-mono"
        >
          {signed(last.cumulative)}
        </text>

        {/* Daily net: zero line, bars */}
        {netTicks
          .filter((t, i) => t === 0 || i === 0 || i === netTicks.length - 1)
          .map((t) => (
            <g key={`n${t}`}>
              <line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={ny(t)}
                y2={ny(t)}
                stroke={t === 0 ? C.zero : C.grid}
                strokeDasharray={t === 0 ? undefined : "2 4"}
              />
              <text x={PAD_L - 8} y={ny(t)} dy="0.32em" textAnchor="end" fill={C.axis} fontSize={10} className="font-mono">
                {compact(t)}
              </text>
            </g>
          ))}
        {points.map((p, i) => {
          if (p.net === 0) return null;
          const y0 = ny(0);
          const y1 = ny(p.net);
          return (
            <rect
              key={`b${p.date}`}
              x={cx(i) - barW / 2}
              y={Math.min(y0, y1)}
              width={barW}
              height={Math.max(1, Math.abs(y1 - y0))}
              rx={Math.min(2, barW / 2)}
              fill={p.net > 0 ? C.in : C.out}
              fillOpacity={hover !== null && hover !== i ? 0.5 : 1}
            />
          );
        })}

        {/* Dates */}
        {points.map((p, i) =>
          labelled[i] ? (
            <text
              key={`x${p.date}`}
              x={cx(i)}
              y={BAR_Y + BAR_H + 16}
              textAnchor="middle"
              fill={C.axis}
              fontSize={10}
              className="font-mono"
            >
              {shortDate(p.date)}
            </text>
          ) : null
        )}

        {/* Hover: crosshair + highlighted point */}
        {h && hover !== null && (
          <g pointerEvents="none">
            <line
              x1={cx(hover)}
              x2={cx(hover)}
              y1={TOP_Y}
              y2={BAR_Y + BAR_H}
              stroke={C.axis}
              strokeDasharray="3 3"
            />
            <circle cx={cx(hover)} cy={cy(h.cumulative)} r={5} fill={C.line} stroke={C.surface} strokeWidth={2} />
          </g>
        )}

        {/* Hit targets: one full-height column per day */}
        {points.map((p, i) => (
          <rect
            key={`h${p.date}`}
            x={PAD_L + band * i}
            y={TOP_Y}
            width={band}
            height={BAR_Y + BAR_H - TOP_Y}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
            onClick={() => onHover(i)}
          />
        ))}
      </svg>

      {h && (
        <div
          className="pointer-events-none rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-lg"
          // Position set inline so it always floats over the top of the
          // chart — if it ever fell back into the normal flow it would sit
          // under the chart and make the panel scroll.
          style={{ position: "absolute", top: TOP_Y, left: tipLeft, width: TOOLTIP_W, zIndex: 20 }}
        >
          <div className="font-mono text-zinc-300 mb-1.5">{h.date}</div>
          <TipRow label={labels.growth_inbound} value={fmt(h.inbound)} swatch={C.in} />
          <TipRow label={labels.growth_outbound} value={fmt(h.outbound)} swatch={C.out} />
          <div className="my-1.5 border-t border-zinc-800" />
          <TipRow label={labels.growth_daily_net} value={signed(h.net)} strong />
          <TipRow label={labels.growth_cumulative} value={signed(h.cumulative)} swatch={C.line} strong />
        </div>
      )}
    </>
  );
}

function TipRow({ label, value, swatch, strong }: { label: string; value: string; swatch?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-zinc-500">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: swatch ?? "transparent" }} aria-hidden />
        {label}
      </span>
      <span className={`font-mono ${strong ? "text-zinc-100 font-semibold" : "text-zinc-300"}`}>{value}</span>
    </div>
  );
}
