"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: number; name: string };
type User = { id: number; username: string; roleId: number | null; roleName: string | null };

export default function UsersClient({
  users,
  roles,
  isAdmin,
}: {
  users: User[];
  roles: Role[];
  isAdmin: boolean;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-900 text-zinc-500 text-left">
            <th className="px-4 py-3 font-medium">Username</th>
            <th className="px-4 py-3 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-zinc-600">
                No users yet.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <UserRow key={user.id} user={user} roles={roles} isAdmin={isAdmin} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user, roles, isAdmin }: { user: User; roles: Role[]; isAdmin: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(roleId: string) {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/users/${user.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: Number(roleId) }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update role");
      return;
    }

    router.refresh();
  }

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
      <td className="px-4 py-3 font-mono text-zinc-300">{user.username}</td>
      <td className="px-4 py-3">
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <select
              value={user.roleId ?? ""}
              onChange={(e) => handleChange(e.target.value)}
              disabled={saving}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="" disabled>
                Select role...
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {saving && <span className="text-xs text-zinc-500">Saving...</span>}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        ) : (
          <span className="text-zinc-400">{user.roleName ?? "—"}</span>
        )}
      </td>
    </tr>
  );
}