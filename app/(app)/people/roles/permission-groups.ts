import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";

export interface PermissionGroup {
  module: string;
  keys: PermissionKey[];
}

/**
 * Groups PERMISSION_KEYS by their dot-prefix module (e.g. "people.manage" ->
 * module "people") for the roles x permissions matrix at /people/roles
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]: "No role/permission
 * management UI — roles.manage exists but nothing lets an admin view/edit
 * role_permissions"). Order follows PERMISSION_KEYS' own declaration order
 * (lib/auth/permissions.ts), so a new key added there shows up here with no
 * further wiring. Kept as a plain, pure function so it's unit-testable
 * without a database or a rendered component.
 */
export function groupPermissionKeys(
  keys: readonly PermissionKey[] = PERMISSION_KEYS,
): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  const indexByModule = new Map<string, number>();

  for (const key of keys) {
    const moduleName = key.split(".")[0];
    let idx = indexByModule.get(moduleName);
    if (idx === undefined) {
      idx = groups.length;
      indexByModule.set(moduleName, idx);
      groups.push({ module: moduleName, keys: [] });
    }
    groups[idx].keys.push(key);
  }

  return groups;
}
