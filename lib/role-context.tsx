import React, { createContext, useContext, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "user" | "engineer" | "merchant";

type RoleContextValue = {
  role: AppRole;
  profile: {
    nickname?: string | null;
    cityName?: string | null;
    creditScore?: number;
    engineerStatus?: string;
    merchantStatus?: string;
  } | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  profileLoading: boolean;
  refetchProfile: () => void;
  refetchWorkspace: () => void;
  activeIdentityId: number | null;
  activeOrganizationId: number | null;
};

const RoleContext = createContext<RoleContextValue>({
  role: "user",
  profile: null,
  isAuthenticated: false,
  authLoading: true,
  profileLoading: true,
  refetchProfile: () => {},
  refetchWorkspace: () => {},
  activeIdentityId: null,
  activeOrganizationId: null,
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const profileQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 10_000,
  });
  const profileData = profileQuery.data;
  const workspaceQuery = trpc.workspace.listAvailable.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 10_000,
  });
  const profileLoading = profileQuery.isLoading;
  const refetchProfile = profileQuery.refetch;

  const value = useMemo<RoleContextValue>(() => {
    const p = profileData?.profile;
    const current = workspaceQuery.data?.current;
    const activeIdentity = current?.workspaceType === "identity"
      ? workspaceQuery.data?.available.find((item) => item.workspaceType === "identity" && "identityId" in item && item.identityId === current.identityId)
      : undefined;
    const preferredRole: AppRole = activeIdentity && "typeCode" in activeIdentity && ["engineer", "merchant"].includes(activeIdentity.typeCode)
      ? activeIdentity.typeCode as AppRole
      : "user";
    return {
      role: preferredRole,
      profile: p
        ? {
            nickname: p.nickname,
            cityName: p.cityName,
            creditScore: p.creditScore,
            engineerStatus: p.engineerStatus,
            merchantStatus: p.merchantStatus,
          }
        : null,
      isAuthenticated,
      authLoading,
      profileLoading: isAuthenticated ? profileLoading : false,
      refetchProfile: () => { void refetchProfile(); },
      refetchWorkspace: () => { void workspaceQuery.refetch(); },
      activeIdentityId: current?.identityId ?? null,
      activeOrganizationId: current?.organizationId ?? null,
    };
  }, [profileData, profileLoading, refetchProfile, isAuthenticated, authLoading, workspaceQuery.data, workspaceQuery.refetch]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
