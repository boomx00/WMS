"use client";

import { Fragment, useState } from "react";

type Role = { id: number; name: string; isSuper: boolean };
type Page = { path: string; label: string };
type Action = { key: string; page: string; label: string; hint: string | null };

// One change = one checkbox: either a page or an action for a role.
type Change = { roleId: number; pagePath?: string; actionKey?: string; allowed: boolean };

const pageId = (roleId: number, path: string) => `${roleId}:p:${path}`;
const actionId = (roleId: number, key: string) => `${roleId}:a:${key}`;
const changeId = (c: Change) => (c.pagePath !== undefined ? pageId(c.roleId, c.pagePath) : actionId(c.roleId, c.actionKey!));

export default function PermissionsClient({
  roles,
  pages,
  actions,
  initialPageGrants,
  initialActionGrants,
}: {
  roles: Role[];
  pages: Page[];
  actions: Action[];
  initialPageGrants: { roleId: number; pagePath: string }[];
  initialActionGrants: { roleId: number; actionKey: string }[];
}) {
  const [granted, setGranted] = useState<Set<string>>(
    () =>
      new Set([
        ...initialPageGrants.map((g) => pageId(g.roleId, g.pagePath)),
        ...initialActionGrants.map((g) => actionId(g.roleId, g.actionKey)),
      ])
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const editableRoles = roles.filter((r) => !r.isSuper);
  const superRoles = roles.filter((r) => r.isSuper);

  function withKeys(prev: Set<string>, ids: string[], on: boolean) {
    const next = new Set(prev);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  }

  async function apply(changes: Change[]) {
    if (changes.length === 0) return;
    setError(null);
    const ids = changes.map(changeId);

    // Optimistic: flip now, roll back any that fail.
    setGranted((prev) => {
      let next = prev;
      for (const c of changes) next = withKeys(next, [changeId(c)], c.allowed);
      return next;
    });
    setPending((prev) => withKeys(prev, ids, true));

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
        let next = prev;
        for (const f of failed) next = withKeys(next, [changeId(f.change)], !f.change.allowed);
        return next;
      });
      setError(failed[0].message);
    }
    setPending((prev) => withKeys(prev, ids, false));
  }

  // Column header click: grant everything if anything is missing, else revoke everything.
  function toggleRole(roleId: number) {
    const all: Change[] = [
      ...pages.map((p) => ({ roleId, pagePath: p.path, allowed: true })),
      ...actions.map((a) => ({ roleId, actionKey: a.key, allowed: true })),
    ];
    const allOn = all.every((c) => granted.has(changeId(c)));
    apply(
      all
        .filter((c) => granted.has(changeId(c)) === allOn)
        .map((c) => ({ ...c, allowed: !allOn }))
    );
  }

  if (editableRoles.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
        No other roles yet. Create one on the Roles page.
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
              <th className="px-4 py-3 font-medium sticky left-0 bg-zinc-900">Page / action</th>
              {superRoles.map((r) => (
                <th key={r.id} className="px-4 py-3 font-medium text-center whitespace-nowrap">
                  {r.name}
                </th>
              ))}
              {editableRoles.map((r) => (
                <th key={r.id} className="px-4 py-3 font-medium text-center whitespace-nowrap">
                  <button
                    onClick={() => toggleRole(r.id)}
                    title="Toggle everything for this role"
                    className="hover:text-amber-500 transition-colors"
                  >
                    {r.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const pageActions = actions.filter((a) => a.page === page.path);
              return (
                <Fragment key={page.path}>
                  <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-3 sticky left-0 bg-zinc-950">
                      <div>{page.label}</div>
                      <div className="text-xs text-zinc-600 font-mono">{page.path}</div>
                    </td>
                    {superRoles.map((r) => (
                      <td key={r.id} className="px-4 py-3 text-center text-xs text-zinc-600">
                        always
                      </td>
                    ))}
                    {editableRoles.map((r) => {
                      const id = pageId(r.id, page.path);
                      return (
                        <td key={r.id} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={granted.has(id)}
                            disabled={pending.has(id)}
                            onChange={() =>
                              apply([{ roleId: r.id, pagePath: page.path, allowed: !granted.has(id) }])
                            }
                            aria-label={`${r.name} can open ${page.label}`}
                            className="w-4 h-4 accent-amber-500 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                      );
                    })}
                  </tr>

                  {pageActions.map((action) => (
                    <tr key={action.key} className="border-t border-zinc-800/50 bg-zinc-900/20">
                      <td className="pl-10 pr-4 py-2 sticky left-0 bg-zinc-950">
                        <div className="text-zinc-300 text-xs">↳ {action.label}</div>
                        {action.hint && <div className="text-[11px] text-zinc-600">{action.hint}</div>}
                      </td>
                      {superRoles.map((r) => (
                        <td key={r.id} className="px-4 py-2 text-center text-xs text-zinc-600">
                          always
                        </td>
                      ))}
                      {editableRoles.map((r) => {
                        const id = actionId(r.id, action.key);
                        const pageOn = granted.has(pageId(r.id, page.path));
                        return (
                          <td key={r.id} className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={granted.has(id)}
                              disabled={pending.has(id) || !pageOn}
                              onChange={() =>
                                apply([{ roleId: r.id, actionKey: action.key, allowed: !granted.has(id) }])
                              }
                              title={pageOn ? undefined : "Grant the page first"}
                              aria-label={`${r.name}: ${action.label}`}
                              className="w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 mt-3">
        Changes save as you click. Actions (↳) only work when their page is also ticked. Click a role
        name to toggle everything for that role.
      </p>
    </div>
  );
}
