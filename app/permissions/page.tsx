import { db } from "@/lib/db";
import { roles, rolePagePermissions, roleActionPermissions } from "@/db/schema";
import { isSuperRoleName, SUPER_ROLE_NAME } from "@/lib/roles";
import { APP_ACTIONS, GRANTABLE_PAGES, isActionKey, isGrantablePath } from "@/lib/pages";
import PermissionsClient from "./PermissionsClient";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const [roleRows, pageRows, actionRows] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db
      .select({ roleId: rolePagePermissions.roleId, pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions),
    db
      .select({ roleId: roleActionPermissions.roleId, actionKey: roleActionPermissions.actionKey })
      .from(roleActionPermissions),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Which web pages each role can open, and what it can do on them.{" "}
          {SUPER_ROLE_NAME} always has everything, and is the only role that can
          manage Users, Roles and Permissions. Changes apply on the user&apos;s next
          page load. A role with no pages can&apos;t log in to the web app. Action
          permissions apply to the web app only; the PDA is unaffected (except
          Edit settings).
        </p>
      </header>

      <PermissionsClient
        roles={roleRows.map((r) => ({ id: r.id, name: r.name, isSuper: isSuperRoleName(r.name) }))}
        pages={GRANTABLE_PAGES.map((p) => ({ path: p.path, label: p.label }))}
        actions={APP_ACTIONS.map((a) => ({ key: a.key, page: a.page, label: a.label, hint: a.hint ?? null }))}
        initialPageGrants={pageRows.filter((g) => isGrantablePath(g.pagePath))}
        initialActionGrants={actionRows.filter((g) => isActionKey(g.actionKey))}
      />
    </div>
  );
}
