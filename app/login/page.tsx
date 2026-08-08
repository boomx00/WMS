"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Login failed");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-zinc-800 rounded-lg p-8 bg-zinc-900/30"
      >
        <div className="mb-6">
          <div className="font-mono text-xs tracking-widest text-amber-500 uppercase">
            WMS
          </div>
          <h1 className="text-xl font-semibold mt-1">Sign in</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-amber-500 text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}