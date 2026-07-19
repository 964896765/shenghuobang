import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

const REASON_MESSAGES: Record<string, string> = {
  IDENTITY_INACTIVE: "该身份已停用，不能切换。",
  CERTIFICATION_INACTIVE: "该身份认证已撤销或过期，请先重新提交认证。",
  ORGANIZATION_MEMBERSHIP_INACTIVE: "组织成员关系已失效，不能进入该工作台。",
  STAFF_POSITION_INACTIVE: "平台职务当前无效。",
  RESOURCE_STATE_FORBIDDEN: "目标工作台当前不可用。",
  CAPABILITY_MISSING: "当前账号没有执行此操作的权限。",
};

function workspaceLabel(item: { workspaceType: string; [key: string]: unknown }) {
  if (item.workspaceType === "personal") return "个人工作台";
  if (item.workspaceType === "identity") return String(item.name ?? item.typeCode ?? "业务身份");
  if (item.workspaceType === "organization") return String(item.name ?? "组织工作台");
  return `平台工作台 · ${String(item.positionCode ?? "职务")}`;
}

function WorkspaceInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.workspace.listAvailable.useQuery();
  const [error, setError] = useState("");
  const mutation = trpc.workspace.switch.useMutation({
    onSuccess: async () => {
      setError("");
      await Promise.all([
        utils.workspace.invalidate(),
        utils.identity.invalidate(),
        utils.certification.invalidate(),
        utils.organization.invalidate(),
        utils.profile.invalidate(),
        utils.auth.invalidate(),
        utils.admin.invalidate(),
      ]);
    },
    onError: (cause) => setError(REASON_MESSAGES[cause.message] ?? cause.message),
  });

  if (query.isLoading) return <LoadingView />;
  if (query.isError) return <EmptyState title="工作台加载失败" hint={REASON_MESSAGES[query.error.message] ?? query.error.message} actionTitle="重试" onAction={() => query.refetch()} />;
  if (!query.data) return <EmptyState title="暂无可用工作台" actionTitle="重试" onAction={() => query.refetch()} />;

  const current = query.data.current;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4">
        <Text className="text-base font-semibold text-foreground">工作台只影响界面与查询上下文</Text>
        <Text className="text-sm text-muted mt-1 leading-5">切换不会授予新权限。每次操作仍由服务端按身份、认证、成员关系和岗位能力重新判定。</Text>
      </View>
      {query.data.available.map((item, index) => {
        const identityId = "identityId" in item ? item.identityId : null;
        const organizationId = "organizationId" in item ? item.organizationId : null;
        const platformStaffPositionId = "platformStaffPositionId" in item ? item.platformStaffPositionId : null;
        const selected = current.workspaceType === item.workspaceType &&
          (item.workspaceType === "personal" || current.identityId === identityId || current.organizationId === organizationId || current.platformStaffPositionId === platformStaffPositionId);
        const available = item.available;
        const unavailableReason = item.unavailableReason;
        return (
          <Pressable
            key={`${item.workspaceType}-${identityId ?? organizationId ?? platformStaffPositionId ?? index}`}
            disabled={!available || selected || mutation.isPending}
            onPress={() => {
              setError("");
              if (item.workspaceType === "personal") mutation.mutate({ workspaceType: "personal" });
              else if (item.workspaceType === "identity" && identityId) mutation.mutate({ workspaceType: "identity", identityId });
              else if (item.workspaceType === "organization" && organizationId) mutation.mutate({ workspaceType: "organization", organizationId });
              else if (item.workspaceType === "platform" && platformStaffPositionId) mutation.mutate({ workspaceType: "platform", platformStaffPositionId });
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : available ? 1 : 0.55 })}
          >
            <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground flex-1">{workspaceLabel(item)}</Text>
                <StatusBadge label={selected ? "当前" : available ? "可切换" : "不可用"} tone={selected ? "green" : available ? "blue" : "red"} />
              </View>
              {"certificationStatus" in item && item.certificationStatus ? <Text className="text-xs text-muted mt-2">认证状态：{String(item.certificationStatus)}</Text> : null}
              {!available && unavailableReason ? <Text className="text-sm text-error mt-2">{REASON_MESSAGES[unavailableReason] ?? unavailableReason}</Text> : null}
            </View>
          </Pressable>
        );
      })}
      {error ? <Text className="text-sm text-error mb-3">{error}</Text> : null}
      <PrimaryButton title="返回我的" variant="outline" onPress={() => router.back()} />
    </ScrollView>
  );
}

export default function WorkspacesScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="身份与工作台" /><AuthGate title="登录后切换工作台"><WorkspaceInner /></AuthGate></ScreenContainer>;
}
