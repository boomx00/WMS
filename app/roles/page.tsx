import { db } from "@/lib/db";
import { roles } from "@/db/schema";
import CreateRoleForm from "./CreateRoleForm";

export const dynamic = "force-dynamic";

async function getRoles() {
  return db.select().from(roles).orderBy(roles.name);
}

export default async function RolesPage() {
  const roleRows = await getRoles();

  return (
    <div className="p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Roles</h1>
        <p className="text-zinc-500 text-sm mt-1">
          User roles (Inbound, Forklift Driver, Admin, etc).
        </p>
      </header>

      <div className="mb-8">
        <CreateRoleForm />
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Name</th>
            </tr>
          </thead>
          <tbody>
            {roleRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-600">
                  No roles yet.
                </td>
              </tr>
            ) : (
              roleRows.map((role) => (
                <tr
                  key={role.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">{role.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}