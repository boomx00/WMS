"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: number; name: string };

export default function CreateUserForm({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<string>(roles[0]?.id.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, roleId: Number(roleId) }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create user");
      return;
    }

    setUsername("");
    setPassword("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 flex items-end gap-3"
    >
      <div className="flex-1">
        <label className="block text-xs text-zinc-500 mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="flex-1">
        <label className="block text-xs text-zinc-500 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="flex-1">
        <label className="block text-xs text-zinc-500 mb-1">Role</label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          {roles.length === 0 && <option value="">No roles yet</option>}
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading || roles.length === 0}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adding..." : "Add user"}
      </button>

      {error && <p className="text-xs text-red-400 ml-2">{error}</p>}
    </form>
  );
}