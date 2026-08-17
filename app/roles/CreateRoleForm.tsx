"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateRoleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create role");
      return;
    }

    setName("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 flex items-end gap-3"
    >
      <div className="flex-1">
        <label className="block text-xs text-zinc-500 mb-1">Role name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Forklift Driver"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adding..." : "Add role"}
      </button>

      {error && <p className="text-xs text-red-400 ml-2">{error}</p>}
    </form>
  );
}