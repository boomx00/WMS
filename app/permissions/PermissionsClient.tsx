"use client";

import { useState } from "react";

type Role = { id: number; name: string; isAdmin: boolean };
type Page = { path: string; label: string };
type Grant = { roleId: number; pagePath: string };

const key = (roleId: number, pagePath: string) => `${roleId}:${pagePath}`;

export default function PermissionsClient({
  roles,
  pages,
  initialGrants,
}: {
  roles: Role[];
  pages: Page[];
  initialGrants: Grant[];
}) {
  const [granted, setGranted] = useState<Set<string>>(
    () => new Set(initialGrants.map((g) => key(g.roleId, g.pagePath)))
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const editableRoles = roles.filter((r) => !r.isAdmin);
  const adminRoles = roles.filter((r) => r.isAdmin);

  function setMany(next: Set<string>, keys: string[], on: boolean) {
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    return next;
  }

  async function apply(changes: { roleId: number; pagePath: string; allowed: boolean }[]) {
    if (changes.length === 0) return;
    setError(null);
    const keys = changes.map((c) => key(c.roleId, c.pagePath));

    // Optimistic: flip now, roll back any that fail.
    setGranted((prev) => {
      const next = new Set(prev);
      for (const c of changes) setMany(next, [key(c.roleId, c.pagePath)], c.allowed);
      return next;
    });
    setPending((prev) => setMany(new Set(prev), keys, true));

    const results = await Promise.all(
      changes.map(async (c) => {
        try {
          const res = await fetch("/api/permissions", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(c),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
          return null;
        } catch (err) {
          return { change: c, message: err instanceof Error ? err.message : "Failed to save" };
        }
      })
    );

    const failed = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (failed.length > 0) {
      setGranted((prev) => {
        const next = new Set(prev);
        for (const f of failed) setMany(next, [key(f.change.roleId, f.change.pagePath)], !f.change.allowed);
        return next;
      });
      setError(failed[0].message);
    }
    setPending((prev) => setMany(new Set(prev), keys, false));
  }

  function toggle(roleId: number, pagePath: string) {
    apply([{ roleId, pagePath, allowed: !granted.has(key(roleId, pagePath)) }]);
  }

  // Column header click: grant all pages if any are missing, else revoke all.
  function toggleRole(roleId: number) {
    const allOn = pages.every((p) => granted.has(key(roleId, p.path)));
    apply(
      pages
        .filter((p) => granted.has(key(roleId, p.path)) === allOn)
        .map((p) => ({ roleId, pagePath: p.path, allowed: !allOn }))
    );
  }

  if (editableRoles.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
        No non-admin roles yet. Create one on the Roles page.
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-2 rounded-md border border-red-900 bg-red-950/40 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium sticky left-0 bg-zinc-900">Page</th>
              {adminRoles.map((r) => (
                <th key={r.id} className="px-4 py-3 font-medium text-center whitespace-nowrap">
                  {r.name}
                </th>
              ))}
              {editableRoles.map((r) => (
                <th key={r.id} className="px-4 py-3 font-medium text-center whitespace-nowrap">
                  <button
                    onClick={() => toggleRole(r.id)}
                    title="Toggle all pages for this role"
                    className="hover:text-amber-500 transition-colors"
                  >
                    {r.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.path} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                <td className="px-4 py-3 sticky left-0 bg-zinc-950">
                  <div>{page.label}</div>
                  <div className="text-xs text-zinc-600 font-mono">{page.path}</div>
                </td>
                {adminRoles.map((r) => (
                  <td key={r.id} className="px-4 py-3 text-center text-xs text-zinc-600">
                    always
                  </td>
                ))}
                {editableRoles.map((r) => {
                  const k = key(r.id, page.path);
                  return (
                    <td key={r.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={granted.has(k)}
                        disabled={pending.has(k)}
                        onChange={() => toggle(r.id, page.path)}
                        aria-label={`${r.name} can open ${page.label}`}
                        className="w-4 h-4 accent-amber-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 mt-3">
        Changes save as you click. Click a role name to toggle all its pages.
      </p>
    </div>
  );
}
