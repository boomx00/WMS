"use client";

// Small building blocks shared by the Locations page and its two popups.

import { useEffect } from "react";
import type { LocationListRow, LocationTypeListRow } from "@/lib/locationAdmin";

export type Labels = Record<string, string>;
export type TypeRow = Omit<LocationTypeListRow, "createdAt">;
export type LocationRowData = LocationListRow;
// A Total Stock column from Settings → Total Stock Columns (each belongs to
// one warehouse).
export type StockColumnOption = { id: number; name: string; warehouseId: number };
// A warehouse (parent location), in display order — the first active one
// is the default.
export type WarehouseRow = {
  id: number;
  name: string;
  isActive: boolean;
  defaultReceivingLocationId: number | null;
  defaultStagingLocationId: number | null;
  locationCount: number;
};

// What a location is used for, as table badges: Receiving / Staging.
export function purposeLabels(location: Pick<LocationListRow, "isReceiving" | "isStaging">, labels: Labels): string[] {
  const out: string[] = [];
  if (location.isReceiving) out.push(labels.role_receiving);
  if (location.isStaging) out.push(labels.role_staging);
  return out;
}

// What a counted location shows under: its column's name, or "Total only".
export function columnLabel(columnId: number | null, columns: StockColumnOption[], labels: Labels): string {
  if (columnId === null) return labels.bucket_none;
  return columns.find((c) => c.id === columnId)?.name ?? labels.bucket_none;
}

// "{n} things" -> "3 things"
export function fill(template: string | undefined, values: Record<string, string | number>): string {
  return (template ?? "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

export const inputClass =
  "w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 disabled:opacity-60 placeholder:text-zinc-600";

export function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">{children}</div>
        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-2">{footer}</div>
      </form>
    </div>
  );
}

export function ModalFooter({
  readOnly,
  saving,
  labels,
  onClose,
}: {
  readOnly: boolean;
  saving: boolean;
  labels: Labels;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        {readOnly ? labels.btn_close : labels.btn_cancel}
      </button>
      {!readOnly && (
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {saving ? labels.btn_saving : labels.btn_save}
        </button>
      )}
    </>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-start gap-2.5 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-amber-500 shrink-0"
      />
      <span className="text-zinc-300">{children}</span>
    </label>
  );
}

export function Hint({ tone = "muted", children }: { tone?: "muted" | "warn" | "error"; children: React.ReactNode }) {
  const color = tone === "error" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-zinc-500";
  return <p className={`text-xs ${color}`}>{children}</p>;
}

export function Badge({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "zinc" }) {
  const colors =
    tone === "amber"
      ? "border-amber-900 bg-amber-950/40 text-amber-400"
      : "border-zinc-800 bg-zinc-900 text-zinc-400";
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${colors}`}>
      {children}
    </span>
  );
}

export function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      aria-label={title}
      className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

export function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// Reads { error } from a failed response without throwing on non-JSON
// bodies (e.g. an HTML 404 page).
export async function readError(res: Response, fallback: string): Promise<{ error: string; roleHolder?: string }> {
  const body = await res.json().catch(() => null);
  return { error: body?.error ?? `${fallback} (${res.status})`, roleHolder: body?.roleHolder };
}
