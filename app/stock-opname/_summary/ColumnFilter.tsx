"use client";

import { useEffect, useRef, useState } from "react";

// A report column header with a filter: the label plus a ▾ button opening a
// checklist of the column's values (with how many lines have each), a
// search box, and Select all / Clear all (for the values matching the
// search). `hidden` = the unticked values.
export function ColumnFilter({
  label,
  options,
  hidden,
  onChange,
  onOpenChange,
  labels,
}: {
  label: string;
  options: { value: string; count: number }[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  onOpenChange: (open: boolean) => void;
  labels: Record<string, string>;
}) {
  const [pos, setPosState] = useState<{ top: number; left: number } | null>(null);
  const setPos = (next: { top: number; left: number } | null) => {
    setPosState(next);
    onOpenChange(next !== null);
  };
  const [search, setSearch] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const active = hidden.length > 0;
  const PANEL_WIDTH = 288;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPosState(null);
      onOpenChange(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    // Capture phase, so Escape closes this list without closing the report.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onOpenChange]);

  function toggleOpen() {
    if (open) return setPos(null);
    const r = button.current!.getBoundingClientRect();
    setSearch("");
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)) });
  }

  const q = search.trim().toLowerCase();
  const matching = q ? options.filter((o) => o.value.toLowerCase().includes(q)) : options;
  const hiddenSet = new Set(hidden);

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <button
        ref={button}
        type="button"
        onClick={toggleOpen}
        title={labels.report_filter_button.replace("{column}", label)}
        aria-label={labels.report_filter_button.replace("{column}", label)}
        aria-expanded={open}
        className={`px-1 rounded text-[10px] leading-4 border transition-colors ${
          active
            ? "border-amber-600 bg-amber-950/60 text-amber-300"
            : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        }`}
      >
        ▾{active ? ` ${options.length - hidden.length}/${options.length}` : ""}
      </button>
      {open && (
        <div
          ref={panel}
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          className="fixed z-[60] rounded-md border border-zinc-700 bg-zinc-900 shadow-xl text-left font-normal text-zinc-200 normal-case"
        >
          <div className="p-2 border-b border-zinc-800 space-y-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.report_filter_search}
              autoFocus
              className="w-full px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange(hidden.filter((v) => !matching.some((o) => o.value === v)))}
                className="flex-1 px-2 py-1 rounded border border-zinc-700 text-xs hover:bg-zinc-800"
              >
                {labels.report_filter_select_all}
              </button>
              <button
                type="button"
                onClick={() => onChange([...new Set([...hidden, ...matching.map((o) => o.value)])])}
                className="flex-1 px-2 py-1 rounded border border-zinc-700 text-xs hover:bg-zinc-800"
              >
                {labels.report_filter_clear_all}
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {matching.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">{labels.report_filter_no_values}</p>
            ) : (
              matching.map((o) => (
                <label
                  key={o.value}
                  className="flex items-start gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-zinc-800"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenSet.has(o.value)}
                    onChange={() =>
                      onChange(hiddenSet.has(o.value) ? hidden.filter((v) => v !== o.value) : [...hidden, o.value])
                    }
                    className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
                  />
                  <span className="flex-1 break-words">{o.value}</span>
                  <span className="text-zinc-500 tabular-nums">{o.count}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}
