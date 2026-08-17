"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateLocationForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [type, setType] = useState("FLOOR");
  const [area, setArea] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body: Record<string, unknown> = { code, type };
    if (type === "RACK") {
      body.area = area;
      body.x = Number(x);
      body.y = Number(y);
    }

    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create location");
      return;
    }

    setCode("");
    setArea("");
    setX("");
    setY("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 flex items-end gap-3 flex-wrap"
    >
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs text-zinc-500 mb-1">Code</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="w-40">
        <label className="block text-xs text-zinc-500 mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="FLOOR">FLOOR</option>
          <option value="DESTROY">DESTROY</option>
          <option value="LEFTOVER">LEFTOVER</option>
          <option value="RACK">RACK</option>
        </select>
      </div>

      {type === "RACK" && (
        <>
          <div className="w-20">
            <label className="block text-xs text-zinc-500 mb-1">Area</label>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              required
            />
          </div>
          <div className="w-20">
            <label className="block text-xs text-zinc-500 mb-1">X</label>
            <input
              type="number"
              value={x}
              onChange={(e) => setX(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              required
            />
          </div>
          <div className="w-20">
            <label className="block text-xs text-zinc-500 mb-1">Y</label>
            <input
              type="number"
              value={y}
              onChange={(e) => setY(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              required
            />
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adding..." : "Add location"}
      </button>

      {error && <p className="text-xs text-red-400 w-full">{error}</p>}
    </form>
  );
}