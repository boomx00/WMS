"use client";

import { useState } from "react";

// Drop-in replacement for <input type="datetime-local">. The native control
// shows AM/PM or 24-hour depending on the viewer's OS/browser locale and
// can't be forced either way from HTML, so this renders a date picker plus
// 00–23 hour and 00–59 minute dropdowns instead — always 24-hour.
//
// value / onChange use the same "YYYY-MM-DDTHH:mm" string as datetime-local
// (empty string when no date is chosen), so callers don't change.

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const fieldClass =
  "px-2 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500";

export default function DateTime24Input({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const [h, m] = (timePart ?? "").split(":");

  // Remember hour/minute picked before a date exists, so choosing the time
  // first and the date second doesn't lose the time.
  const [pendingHour, setPendingHour] = useState("00");
  const [pendingMinute, setPendingMinute] = useState("00");

  const hour = h || pendingHour;
  const minute = m || pendingMinute;

  function emit(date: string, hh: string, mm: string) {
    onChange(date ? `${date}T${hh}:${mm}` : "");
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={datePart ?? ""}
        onChange={(e) => emit(e.target.value, hour, minute)}
        className={fieldClass}
      />
      <select
        value={hour}
        onChange={(e) => {
          setPendingHour(e.target.value);
          emit(datePart ?? "", e.target.value, minute);
        }}
        className={fieldClass}
        aria-label="Hour (24-hour)"
      >
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="text-zinc-500">:</span>
      <select
        value={minute}
        onChange={(e) => {
          setPendingMinute(e.target.value);
          emit(datePart ?? "", hour, e.target.value);
        }}
        className={fieldClass}
        aria-label="Minute"
      >
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}