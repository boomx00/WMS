"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PrintLocationSearchPage() {
  const [code, setCode] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    router.push(`/locations/print/${encodeURIComponent(code.trim())}`);
  }

  return (
    <div className="p-8 max-w-md">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Print Location Label</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Enter a location code to generate a printable barcode.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="A.1.1"
          autoFocus
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400"
        >
          Generate
        </button>
      </form>
    </div>
  );
}