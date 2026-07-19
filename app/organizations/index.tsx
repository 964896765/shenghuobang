import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function OrganizationsInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.organization.listMine.useQuery();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [organizationType, setOrganizationType] = useState("company");
  const [cityName, setCityName] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [error, setError] = useState("");
  const create = trpc.organization.create.useMutation({
    onSuccess: async () => { setCreating(false); setName(""); setCityName(""); setError(""); await Promise.all([utils.organization.invalidate(), utils.workspace.invalidate()]); },
    onError: (cause) => setError(cause.message),
  });
  const respondInvitation = trpc.organization.respondInvitation.useMutation({
    onSuccess: async () => { setInvitationToken(""); setError(""); await Promise.all([utils.organization.invalidate(), utils.workspace.invalidate()]); },
    onError: (cause) => setError(cause.message),
  });

  if (query.isLoading) return <LoadingView />;
  if (query.isError) return <EmptyState title="组织加载失败" hint={query.error.message} actionTitle="重试" onAction={() => query.refetch()} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <PrimaryButton title={creating ? "取消创建" : "创建组织"} variant={creating ? "outline" : "primary"} onPress={() => setCreating((value) => !value)} />
      {creating ? (
        <View className="bg-surface border border-border rounded-2xl p-4 mt-3">
          <Text className="text-sm text-muted leading-5">创建组织是独立动作，不会由商家身份申请自动触发。创建者将获得由组织岗位目录初始化的 owner 岗位。</Text>
          <FieldLabel label="组织名称" required /><AppTextInput value={name} onChangeText={setName} placeholder="请输入组织名称" />
          <FieldLabel label="组织类型" required /><AppTextInput value={organizationType} onChangeText={setOrganizationType} placeholder="company / studio / team" />
          <FieldLabel label="所在城市" /><AppTextInput value={cityName} onChangeText={setCityName} placeholder="选填" />
          {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}
          <View className="mt-4"><PrimaryButton title="确认创建" loading={create.isPending} disabled={name.trim().length < 2 || organizationType.trim().length < 2} onPress={() => create.mutate({ name: name.trim(), organizationType: organizationType.trim(), cityName: cityName.trim() || undefined })} /></View>
        </View>
      ) : null}
      <View className="bg-surface border border-border rounded-2xl p-4 mt-3">
        <Text className="text-base font-semibold text-foreground">处理组织邀请</Text>
        <Text className="text-xs text-muted mt-1">邀请令牌仅用于本次提交，不写入客户端缓存或日志。</Text>
        <FieldLabel label="邀请令牌" /><AppTextInput value={invitationToken} onChangeText={setInvitationToken} placeholder="粘贴邀请令牌" secureTextEntry />
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1"><PrimaryButton title="接受" small loading={respondInvitation.isPending} disabled={invitationToken.length < 32} onPress={() => respondInvitation.mutate({ token: invitationToken, action: "accept" })} /></View>
          <View className="flex-1"><PrimaryButton title="拒绝" small variant="outline" disabled={invitationToken.length < 32 || respondInvitation.isPending} onPress={() => respondInvitation.mutate({ token: invitationToken, action: "decline" })} /></View>
        </View>
      </View>
      <Text className="text-base font-semibold text-foreground mt-5 mb-3">我的组织</Text>
      {!query.data?.length ? <EmptyState title="还没有组织" hint="你可以创建组织，或接受组织邀请后在这里进入工作台。" /> : query.data.map((item) => (
        <Pressable key={item.id} onPress={() => router.push(`/organizations/${item.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between"><Text className="text-base font-semibold text-foreground flex-1">{item.name}</Text><StatusBadge label={item.membershipStatus} tone={item.membershipStatus === "active" ? "green" : "red"} /></View>
            <Text className="text-sm text-muted mt-1">{item.organizationType}{item.cityName ? ` · ${item.cityName}` : ""}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function OrganizationsScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="我的组织" /><AuthGate title="登录后管理组织"><OrganizationsInner /></AuthGate></ScreenContainer>;
}
