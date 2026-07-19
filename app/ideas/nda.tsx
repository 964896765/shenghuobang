import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { StableIdeaRequestIds, ideaErrorMessage } from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

function NdaContent() {
  const { ideaId: rawIdeaId } = useLocalSearchParams<{ ideaId: string }>();
  const ideaId = Number(rawIdeaId);
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const nda = trpc.ideas.getNda.useQuery({ ideaId }, { enabled: Number.isSafeInteger(ideaId) && ideaId > 0 });
  const status = trpc.ideas.getNdaStatus.useQuery({ ideaId }, { enabled: Number.isSafeInteger(ideaId) && ideaId > 0 });
  const invitations = trpc.ideas.listInvitations.useQuery({ direction: "received", ideaId, limit: 50 }, { enabled: Number.isSafeInteger(ideaId) && ideaId > 0 });
  const mutation = trpc.ideas.acceptNda.useMutation();
  const [error, setError] = useState("");
  if (nda.isLoading || status.isLoading || invitations.isLoading) return <LoadingView text="正在加载保密协议…" />;
  if (nda.isError) return <ErrorState title="无法读取保密协议" hint={ideaErrorMessage(nda.error)} onRetry={() => Promise.all([nda.refetch(), status.refetch(), invitations.refetch()])} />;
  if (!nda.data || !status.data) return <EmptyState title="当前没有可接受的保密协议" />;
  const invitation = invitations.data?.find((item) => ["pending", "accepted"].includes(item.status));
  const accept = async () => {
    if (!invitation || mutation.isPending) return;
    const key = `nda-${ideaId}-${invitation.invitedIdentityId}-${nda.data.ndaVersion}`;
    try {
      await mutation.mutateAsync({ ideaId, identityId: invitation.invitedIdentityId, requestId: requests.get(key) });
      requests.complete(key);
      setError("");
      await Promise.all([utils.ideas.getNda.invalidate({ ideaId }), utils.ideas.getNdaStatus.invalidate({ ideaId }), utils.ideas.detail.invalidate({ ideaId })]);
    } catch (cause) { setError(ideaErrorMessage(cause)); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-center justify-between"><Text className="text-lg font-bold text-foreground flex-1">{nda.data.title}</Text><StatusBadge label={nda.data.accepted ? "已接受" : nda.data.revokedAt ? "已失效" : "待接受"} tone={nda.data.accepted ? "green" : nda.data.revokedAt ? "red" : "orange"} /></View>
        <Text className="text-xs text-muted mt-2">版本：{nda.data.ndaVersion}</Text>
        <Text className="text-sm text-muted mt-1">创建者身份：{nda.data.creatorDisplayIdentity}</Text>
        <View className="bg-background rounded-xl p-4 mt-4"><Text className="text-sm text-foreground leading-6">{nda.data.terms}</Text></View>
        <Text className="text-sm text-muted mt-4">创意摘要：{nda.data.summary}</Text>
        {nda.data.acceptedAt ? <Text className="text-xs text-muted mt-2">接受时间：{new Date(nda.data.acceptedAt).toLocaleString()}</Text> : null}
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        {nda.data.canAccept && invitation ? <View className="mt-4"><PrimaryButton title="确认接受 NDA" loading={mutation.isPending} disabled={mutation.isPending} onPress={accept} /></View> : null}
        {!nda.data.canAccept && !nda.data.accepted ? <Text className="text-sm text-error mt-4">当前邀请已失效或不允许接受 NDA。</Text> : null}
      </View>
    </ScrollView>
  );
}

export default function IdeaNdaScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="保密协议" /><AuthGate title="登录后查看保密协议"><NdaContent /></AuthGate></ScreenContainer>;
}
