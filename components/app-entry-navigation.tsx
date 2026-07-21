import { useRouter } from "expo-router";

import { startLogin } from "@/constants/app";
import { useRole } from "@/lib/role-context";
import type { AppEntry } from "@/shared/navigation/appNavigation";
import { resolveEntryAccess } from "@/shared/navigation/routePermissions";

export function useAppEntryNavigation() {
  const router = useRouter();
  const { role, isAuthenticated } = useRole();

  return (entry: AppEntry) => {
    const access = resolveEntryAccess(entry, { role, isAuthenticated });
    if (access === "login_required") {
      startLogin();
      return;
    }
    if (access !== "allowed") {
      router.push({
        pathname: "/coming-soon",
        params: { feature: entry.title, state: access },
      } as never);
      return;
    }
    router.push(entry.route as never);
  };
}
