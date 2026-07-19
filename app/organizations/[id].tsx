import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function OrganizationDetailInner({ organizationId }: { organizationId: number }) {
  const utils = trpc.useUtils();
  const organization = trpc.organization.get.useQuery({ organizationId });
  const members = trpc.organization.members.useQuery({ organizationId });
  const positions = trpc.organization.positions.useQuery({ organizationId });
  const [inviteeAccountId, setInviteeAccountId] = useState("");
  const [positionCode, setPositionCode] = useState("");
  const [positionName, setPositionName] = useState("");
  const [capabilityCodes, setCapabilityCodes] = useState("organization.view,organization.member.list");
  const [error, setError] = useState("");
  const invalidate = async () => Promise.all([utils.organization.invalidate(), utils.workspace.invalidate(), utils.profile.invalidate()]);
  const invite = trpc.organization.invite.useMutation({ onSuccess: async () => { setInviteeAccountId(""); setError(""); await invalidate(); }, onError: (cause) => setError(cause.message) });
  const changeStatus = trpc.organization.changeMemberStatus.useMutation({ onSuccess: invalidate, onError: (cause) => setError(cause.message) });
  const assign = trpc.organization.assignPosition.useMutation({ onSuccess: invalidate, onError: (cause) => setError(cause.message) });
  const revoke = trpc.organization.revokePosition.useMutation({ onSuccess: invalidate, onError: (cause) => setError(cause.message) });
  const createPosition = trpc.organization.createPosition.useMutation({
    onSuccess: async () => { setPositionCode(""); setPositionName(""); setError(""); await invalidate(); },
    onError: (cause) => setError(cause.message),
  });
  const assignablePosition = useMemo(() => positions.data?.find((item) => !item.isOwnerPosition), [positions.data]);

  if (organization.isLoading || members.isLoading || positions.isLoading) return <LoadingView />;
  const firstError = organization.error ?? members.error ?? positions.error;
  if (firstError) return <EmptyState title="组织详情加载失败" hint={firstError.message} actionTitle="重试" onAction={() => { organization.refetch(); members.refetch(); positions.refetch(); }} />;
  if (!organization.data) return <EmptyState title="组织不存在或无权访问" actionTitle="重试" onAction={() => organization.refetch()} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <Text className="text-xl font-bold text-foreground">{String(organization.data.name)}</Text>
        <Text className="text-sm text-muted mt-1">{String(organization.data.organizationType)} · {String(organization.data.status)}</Text>
        {organization.data.description ? <Text className="text-sm text-foreground mt-3 leading-5">{String(organization.data.description)}</Text> : null}
      </View>
      <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <Text className="text-base font-semibold text-foreground">创建岗位模板</Text>
        <FieldLabel label="岗位代码" required /><AppTextInput value={positionCode} onChangeText={setPositionCode} autoCapitalize="none" placeholder="例如 project_coordinator" />
        <FieldLabel label="岗位名称" required /><AppTextInput value={positionName} onChangeText={setPositionName} placeholder="例如 项目协调员" />
        <FieldLabel label="能力代码（逗号分隔）" required /><AppTextInput value={capabilityCodes} onChangeText={setCapabilityCodes} multiline placeholder="organization.view,organization.member.list" />
        <View className="mt-3"><PrimaryButton title="创建岗位" loading={createPosition.isPending} disabled={!/^[a-z][a-z0-9_]{1,63}$/.test(positionCode) || !positionName.trim()} onPress={() => createPosition.mutate({ organizationId, code: positionCode, name: positionName.trim(), capabilityCodes: capabilityCodes.split(",").map((item) => item.trim()).filter(Boolean) })} /></View>
      </View>
      <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <Text className="text-base font-semibold text-foreground">邀请成员</Text>
        <FieldLabel label="对方账号 ID" required /><AppTextInput value={inviteeAccountId} onChangeText={setInviteeAccountId} keyboardType="numeric" placeholder="请输入账号 ID" />
        <View className="mt-3"><PrimaryButton title="发送邀请" loading={invite.isPending} disabled={!Number(inviteeAccountId)} onPress={() => invite.mutate({ organizationId, inviteeAccountId: Number(inviteeAccountId), expiresInHours: 168 })} /></View>
      </View>
      <Text className="text-base font-semibold text-foreground mb-3">成员与岗位</Text>
      {!members.data?.length ? <EmptyState title="暂无成员" /> : members.data.map((member) => (
        <View key={member.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <View className="flex-row items-center justify-between"><Text className="text-base font-medium text-foreground">{member.accountName ?? `账号 ${member.accountId}`}</Text><StatusBadge label={member.status} tone={member.status === "active" ? "green" : "red"} /></View>
          <Text className="text-xs text-muted mt-2">岗位：{member.positions.filter((item) => item.assignmentStatus === "active").map((item) => item.positionName).join("、") || "未分配岗位"}</Text>
          <View className="flex-row flex-wrap gap-2 mt-3">
            {member.status === "active" ? <PrimaryButton small variant="outline" title="停用" onPress={() => changeStatus.mutate({ organizationId, membershipId: member.id, action: "suspend", reason: "mobile_admin_action" })} /> : null}
            {member.status === "suspended" ? <PrimaryButton small variant="outline" title="恢复" onPress={() => changeStatus.mutate({ organizationId, membershipId: member.id, action: "restore" })} /> : null}
            {member.status === "active" ? <PrimaryButton small variant="danger" title="移除" onPress={() => changeStatus.mutate({ organizationId, membershipId: member.id, action: "remove", reason: "mobile_admin_action" })} /> : null}
            {member.status === "active" && assignablePosition ? <PrimaryButton small variant="outline" title={`分配${assignablePosition.name}`} onPress={() => assign.mutate({ organizationId, membershipId: member.id, positionId: assignablePosition.id })} /> : null}
            {member.positions.filter((item) => item.assignmentStatus === "active" && !item.isOwnerPosition).map((item) => <PrimaryButton key={item.assignmentId} small variant="outline" title={`撤销${item.positionName}`} onPress={() => revoke.mutate({ organizationId, assignmentId: item.assignmentId, reason: "mobile_admin_action" })} />)}
          </View>
        </View>
      ))}
      {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}
    </ScrollView>
  );
}

export default function OrganizationDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const organizationId = Number(params.id);
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="组织详情" /><AuthGate title="登录后管理组织">{Number.isSafeInteger(organizationId) && organizationId > 0 ? <OrganizationDetailInner organizationId={organizationId} /> : <EmptyState title="组织 ID 无效" />}</AuthGate></ScreenContainer>;
}
