"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = { id: number; name: string };
type User = {
  id: number;
  username: string;
  roleId: number | null;
  roleName: string | null;
  disabledAt: string | null; // ISO string; null = active
};

export default function UsersClient({
  users,
  roles,
  isAdmin,
  currentUserId,
}: {
  users: User[];
  roles: Role[];
  isAdmin: boolean;
  currentUserId: number | null;
}) {
  const [editing, setEditing] = useState<User | null>(null);
  const colCount = isAdmin ? 3 : 2;

  return (
    <>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {isAdmin && <th className="px-4 py-3 font-medium w-24 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-zinc-600">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roles={roles}
                  isAdmin={isAdmin}
                  isSelf={user.id === currentUserId}
                  onEdit={() => setEditing(user)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserRow({
  user,
  roles,
  isAdmin,
  isSelf,
  onEdit,
}: {
  user: User;
  roles: Role[];
  isAdmin: boolean;
  isSelf: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = user.disabledAt !== null;

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

  async function handleToggleDisabled() {
    const message = isDisabled
      ? `Re-enable ${user.username}? They'll be able to log in again.`
      : `Disable ${user.username}? They won't be able to log in, and they'll be signed out of the web app and PDA.`;
    if (!window.confirm(message)) return;

    setSaving(true);
    setError(null);

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !isDisabled }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update user");
      return;
    }

    router.refresh();
  }

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`font-mono ${isDisabled ? "text-zinc-600 line-through" : "text-zinc-300"}`}>
            {user.username}
          </span>
          {isDisabled && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-red-900 bg-red-950/50 text-red-400"
              title={`Disabled since ${formatDateTime(user.disabledAt!)}`}
            >
              Disabled
            </span>
          )}
          {isSelf && <span className="text-xs text-zinc-600">(you)</span>}
        </div>
      </td>
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
      {isAdmin && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            <IconButton title="Edit user" onClick={onEdit} disabled={saving}>
              <PencilIcon />
            </IconButton>
            {/* No stop button on your own row — you can't disable yourself. */}
            {!isSelf && (
              <IconButton
                title={isDisabled ? "Enable user" : "Disable user"}
                onClick={handleToggleDisabled}
                disabled={saving}
                danger
                active={isDisabled}
              >
                <StopIcon />
              </IconButton>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter();
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Only send what changed.
    const body: { username?: string; password?: string } = {};
    if (username.trim() !== user.username) body.username = username.trim();
    if (password) body.password = password;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update user");
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-md"
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">Edit user</h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{user.username}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean; // highlighted state, e.g. the stop button on a disabled user
  children: React.ReactNode;
}) {
  const colors = active
    ? "border-red-900 bg-red-950/50 text-red-400 hover:bg-red-950"
    : danger
      ? "border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900 hover:bg-zinc-900"
      : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md border transition-colors disabled:opacity-50 shrink-0 ${colors}`}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
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

function StopIcon() {
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
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}