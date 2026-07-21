import type { AppEntry, NavigationRole } from "./appNavigation";

export type EntryAccess = "allowed" | "login_required" | "permission_denied" | "feature_disabled";

export function resolveEntryAccess(
  entry: AppEntry,
  context: { role: NavigationRole; isAuthenticated: boolean; capabilities?: readonly string[] },
): EntryAccess {
  if (!entry.enabled) return "feature_disabled";
  if (entry.requiresAuth && !context.isAuthenticated) return "login_required";
  if (!entry.supportedRoles.includes(context.role)) return "permission_denied";
  if (context.capabilities && entry.requiredCapabilities.some((capability) => !context.capabilities?.includes(capability))) {
    return "permission_denied";
  }
  return "allowed";
}
