import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAppEntryNavigation } from "@/components/app-entry-navigation";
import { AuthGate } from "@/components/auth-gate";
import { Avatar, ConfirmDialog, SectionHeader, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { IdentityBadge, TrustBadge } from "@/components/trust-ui";
import { useAuth } from "@/hooks/use-auth";
import { creditLevel } from "@/lib/labels";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import type { AppEntry } from "@/shared/navigation/appNavigation";
import { PROFILE_ENTRIES } from "@/shared/navigation/profileEntries";
import { ROLE_ENTRIES, roleCodesForIdentityType } from "@/shared/navigation/roleEntries";

const GROUPS = [
  { id: "business", title: "我的业务" },
  { id: "creator", title: "创作者中心" },
  { id: "trust", title: "可信资产" },
  { id: "settings", title: "设置" },
] as const;

function MenuEntry({ entry, onPress }: { entry: AppEntry; onPress: (entry: AppEntry) => void }) {
  return (
    <Pressable onPress={() => onPress(entry)} className="flex-row items-center px-4 py-3.5">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
        <IconSymbol name={entry.icon} size={19} color={entry.enabled ? "#16A34A" : "#9CA3AF"} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base text-foreground">{entry.title}</Text>
        <Text className="mt-0.5 text-xs text-muted">{entry.description}</Text>
      </View>
      {!entry.enabled ? <StatusBadge label="建设中" tone="gray" small /> : <IconSymbol name="chevron.right" size={18} color="#C4C9C6" />}
    </Pressable>
  );
}

function ProfileInner() {
  const router = useRouter();
  const navigate = useAppEntryNavigation();
  const { logout } = useAuth();
  const { role, profile } = useRole();
  const workspaceQuery = trpc.workspace.listAvailable.useQuery();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const credit = creditLevel(profile?.creditScore ?? 100);
  const roleLabel = role === "engineer" ? "设计师/工程师" : role === "merchant" ? "企业/服务商" : "个人";
  const availableRoleCodes = new Set<string>([role]);
  const availableCapabilities = new Set<string>();
  let hasOrganizationWorkspace = false;
  for (const item of workspaceQuery.data?.available ?? []) {
    if (!item.available) continue;
    for (const capabilityCode of item.capabilityCodes ?? []) availableCapabilities.add(capabilityCode);
    if (item.workspaceType === "identity" && "typeCode" in item) {
      for (const code of roleCodesForIdentityType(String(item.typeCode))) availableRoleCodes.add(code);
    }
    if (item.workspaceType === "organization") hasOrganizationWorkspace = true;
  }
  const workspaces = ROLE_ENTRIES.filter((entry) => entry.id === "personal" ||
    ((entry.supportedRoles.some((supportedRole) => availableRoleCodes.has(supportedRole)) ||
      (hasOrganizationWorkspace && entry.id === "enterprise")) &&
      entry.requiredCapabilities.every((capability) => availableCapabilities.has(capability))));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
      <View className="flex-row items-center px-4 pb-4 pt-4">
        <Avatar name={profile?.nickname} size={62} />
        <View className="ml-3 flex-1">
          <Text className="text-xl font-bold text-foreground">{profile?.nickname ?? "生活帮用户"}</Text>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <IdentityBadge label={roleLabel} />
            <StatusBadge label={credit.label} tone={credit.tone} small />
            <TrustBadge label="身份已载入" />
          </View>
          <Text className="mt-2 text-xs text-muted">认证状态与信用摘要由服务端返回，客户端不代替授权判断。</Text>
        </View>
        <Pressable onPress={() => router.push("/profile-edit" as never)} className="p-2"><IconSymbol name="pencil" size={20} color="#6B7280" /></Pressable>
      </View>

      <View className="mx-4 mb-4 rounded-2xl border border-border bg-surface p-4">
        <SectionHeader title="角色工作台" actionTitle="切换身份" onAction={() => router.push("/workspaces" as never)} />
        {workspaces.map((entry) => <MenuEntry key={entry.id} entry={entry} onPress={() => router.push("/workspaces" as never)} />)}
      </View>

      {GROUPS.map((group) => (
        <View key={group.id} className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
          <View className="px-4 pt-4"><SectionHeader title={group.title} /></View>
          {PROFILE_ENTRIES.filter((entry) => entry.group === group.id).map((entry) => <MenuEntry key={entry.id} entry={entry} onPress={navigate} />)}
        </View>
      ))}

      <Pressable onPress={() => setLogoutVisible(true)} className="mx-4 flex-row items-center justify-center rounded-2xl border border-red-100 bg-surface py-4">
        <Text className="font-semibold text-error">退出登录</Text>
      </Pressable>
      <ConfirmDialog
        visible={logoutVisible}
        title="退出登录"
        message="退出后需要重新登录才能继续管理业务与可信资产。"
        confirmText="退出登录"
        danger
        onCancel={() => setLogoutVisible(false)}
        onConfirm={async () => { setLogoutVisible(false); await logout(); }}
      />
    </ScrollView>
  );
}

export default function ProfileScreen() {
  return <ScreenContainer><AuthGate title="登录后管理你的生活帮"><ProfileInner /></AuthGate></ScreenContainer>;
}
