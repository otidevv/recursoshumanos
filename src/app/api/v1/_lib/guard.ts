import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { ERR_FORBIDDEN, ERR_UNAUTHENTICATED, fail } from "./response";

export type GuardResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: ReturnType<typeof fail> };

export async function requireAuth(): Promise<GuardResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: fail(ERR_UNAUTHENTICATED, 401) };
  }
  if (!user.active) {
    return { ok: false, response: fail("Cuenta suspendida.", 403) };
  }
  return { ok: true, user };
}

export async function requirePermission(
  perm: PermissionKey,
): Promise<GuardResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!auth.user.permissions.has(perm)) {
    return { ok: false, response: fail(ERR_FORBIDDEN, 403) };
  }
  return auth;
}
