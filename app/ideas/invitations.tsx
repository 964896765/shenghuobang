import { useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  IDEA_INVITATION_LABELS,
  StableIdeaRequestIds,
  canRespondToInvitation,
  effectiveInvitationStatus,
  ideaErrorMessage,
  type IdeaInvitationStatus,
} from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

type InvitationRow = {
  id: number; ideaId: number; ideaTitle: string; invitedIdentityId: number; requestedRole: "designer" | "engineer" | "viewer";
  status: IdeaInvitationStatus; ndaRequired: boolean; expiresAt: Date | string; acceptedAt?: Date | string | null; message?: string | null;
};

function Invitations() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [error, setError] = useState("");
  const received = trpc.ideas.listInvitations.useQuery({ direction: "received", limit: 50 });
  const sent = trpc.ideas.listInvitations.useQuery({ direction: "sent", limit: 50 });
  const active = direction === "received" ? received : sent;
  const accept = trpc.ideas.acceptInvitation.useMutation();
  const decline = trpc.ideas.declineInvitation.useMutation();
  const revoke = trpc.ideas.revokeInvitation.useMutation();
  const pending = accept.isPending || decline.isPending || revoke.isPending;

  const refresh = async () => { setError(""); await Promise.all([received.refetch(), sent.refetch()]); };
  const act = async (kind: "accept" | "decline" | "revoke", row: InvitationRow) => {
    if (pending) return;
    const key = `${kind}-${row.id}`;
    try {
      if (kind === "accept") await accept.mutateAsync({ invitationId: row.id, requestId: requests.get(key) });
      else if (kind === "decline") await decline.mutateAsync({ invitationId: row.id, requestId: requests.get(key) });
      else await revoke.mutateAsync({ ideaId: row.ideaId, invitationId: row.id, requestId: requests.get(key) });
      requests.complete(key);
      setError("");
      await Promise.all([utils.ideas.listInvitations.invalidate(), utils.ideas.detail.invalidate({ ideaId: row.ideaId }), utils.ideas.getNdaStatus.invalidate({ ideaId: row.ideaId })]);
    } catch (cause) { setError(ideaErrorMessage(cause)); }
  };

  if (active.isLoading) return <LoadingView text="正在加载协作邀请…" />;
  if (active.isError) return <ErrorState title="无法加载邀请" hint={ideaErrorMessage(active.error)} onRetry={refresh} />;
  const rows = (active.data ?? []) as InvitationRow[];
  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={received.isRefetching || sent.isRefetching} onRefresh={refresh} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
      ListHeaderComponent={(
        <View className="mb-3">
          <View className="flex-row gap-2">
            <View className="flex-1"><PrimaryButton title="收到的邀请" variant={direction === "received" ? "primary" : "outline"} onPress={() => setDirection("received")} /></View>
            <View className="flex-1"><PrimaryButton title="发出的邀请" variant={direction === "sent" ? "primary" : "outline"} onPress={() => setDirection("sent")} /></View>
          </View>
          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        </View>
      )}
      ListEmptyComponent={<EmptyState title={direction === "received" ? "暂无收到的邀请" : "暂无发出的邀请"} hint="协作邀请会显示在这里。" />}
      renderItem={({ item }) => {
        const status = effectiveInvitationStatus(item.status, item.expiresAt);
        const canRespond = direction === "received" && canRespondToInvitation(item.status, item.expiresAt);
        return (
          <Pressable onPress={() => router.push(`/ideas/${item.ideaId}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between"><Text className="text-base font-semibold text-foreground flex-1" numberOfLines={1}>{item.ideaTitle}</Text><StatusBadge label={IDEA_INVITATION_LABELS[status]} tone={status === "accepted" ? "green" : status === "pending" ? "blue" : status === "expired" ? "red" : "gray"} /></View>
              <Text className="text-sm text-muted mt-2">角色：{item.requestedRole} · 身份 #{item.invitedIdentityId}</Text>
              {item.message ? <Text className="text-sm text-foreground mt-2 leading-5">{item.message}</Text> : null}
              <Text className="text-xs text-muted mt-2">有效期至 {new Date(item.expiresAt).toLocaleString()}</Text>
              {item.ndaRequired ? <Pressable onPress={() => router.push(`/ideas/nda?ideaId=${item.ideaId}` as never)}><Text className="text-sm text-action mt-2">查看保密协议与状态 →</Text></Pressable> : null}
              {canRespond ? <View className="flex-row gap-2 mt-3"><View className="flex-1"><PrimaryButton title="接受" small loading={accept.isPending} onPress={() => act("accept", item)} /></View><View className="flex-1"><PrimaryButton title="拒绝" variant="danger" small loading={decline.isPending} onPress={() => act("decline", item)} /></View></View> : null}
              {direction === "sent" && ["pending", "accepted"].includes(status) ? <View className="mt-3"><PrimaryButton title="撤销邀请" variant="danger" small loading={revoke.isPending} onPress={() => act("revoke", item)} /></View> : null}
              {status === "expired" ? <Text className="text-xs text-error mt-3">邀请已过期，操作按钮已停用。</Text> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export default function IdeaInvitationsScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="协作邀请" /><AuthGate title="登录后处理协作邀请"><Invitations /></AuthGate></ScreenContainer>;
}
