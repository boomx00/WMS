import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSession, sessionIsSuper } from "@/lib/auth";
import CreateUserForm from "./CreateUserForm";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

async function getUsers() {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      roleId: users.roleId,
      roleName: roles.name,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    // Active users first, disabled ones at the bottom.
    .orderBy(sql`${users.disabledAt} is not null`, users.username);

  return rows.map((row) => ({
    ...row,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
  }));
}

async function getAllRoles() {
  return db.select().from(roles).orderBy(roles.name);
}


export default async function UsersPage() {
  const [userList, roleList, isAdmin, session] = await Promise.all([
    getUsers(),
    getAllRoles(),
    sessionIsSuper(),
    getSession(),
  ]);

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {isAdmin ? "Manage warehouse staff accounts and roles." : "Read-only — only Manager can change roles."}
        </p>
      </header>

      {isAdmin && (
        <div className="mb-8">
          <CreateUserForm roles={roleList} />
        </div>
      )}

      <UsersClient
        users={userList}
        roles={roleList}
        isAdmin={isAdmin}
        currentUserId={session?.userId ?? null}
      />
    </div>
  );
}