import type { Actor } from "@/server/auth/rbac";
import { requirePermission } from "@/server/auth/rbac";
import type { Permission } from "@/server/auth/permissions";

/** Every admin endpoint requires admin.access plus its specific permission. */
export function adminGuard(actor: Actor | null, perm: Permission) {
  requirePermission(actor, "admin.access");
  return requirePermission(actor, perm);
}
