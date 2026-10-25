// Role names with special meaning. Safe to import anywhere (no DB access).

// The top role. Always has every page and every action, can't be edited on
// /permissions, and is the only role that can manage users, roles and
// permissions. (The old "Admin" role is renamed to this by the migration.)
// Every other role — including any role named "Admin" — is a normal role
// configured on /permissions.
export const SUPER_ROLE_NAME = "Manager";

export function isSuperRoleName(roleName: string | null | undefined): boolean {
  return roleName?.toLowerCase() === SUPER_ROLE_NAME.toLowerCase();
}
