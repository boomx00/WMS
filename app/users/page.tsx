import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import CreateUserForm from "./CreateUserForm";

export const dynamic = "force-dynamic";

async function getUsers() {
  return db
    .select({
      id: users.id,
      username: users.username,
      roleName: roles.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .orderBy(users.username);
}

async function getRoles() {
  return db.select().from(roles);
}

export default async function UsersPage() {
  const [userRows, roleRows] = await Promise.all([getUsers(), getRoles()]);

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manage warehouse staff accounts.
        </p>
      </header>

      <div className="mb-8">
        <CreateUserForm roles={roleRows} />
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {userRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-600">
                  No users yet.
                </td>
              </tr>
            ) : (
              userRows.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">{user.username}</td>
                  <td className="px-4 py-3 text-zinc-400">{user.roleName}</td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}