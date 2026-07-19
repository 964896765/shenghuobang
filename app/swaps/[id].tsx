import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ListingCard } from "@/components/cards";
import { ConfirmDialog, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { SWAP_STATUS } from "@/lib/labels";
import { trpc } from "@/lib/trpc";

type PendingAction = "accept" | "reject" | "cancel" | "confirm" | null;

function SwapDetailInner() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const utils = trpc.useUtils();
  const detail = trpc.swaps.detail.useQuery({ id }, { enabled: Number.isFinite(id) });
  const respond = trpc.swaps.respond.useMutation();
  const cancel = trpc.swaps.cancel.useMutation();
  const confirm = trpc.swaps.confirm.useMutation();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");

  if (detail.isLoading) return <LoadingView />;
  if (detail.isError || !detail.data) return <ErrorState title="无法加载置换详情" hint={detail.error?.message ?? "置换请求不存在"} onRetry={() => detail.refetch()} />;
  const { request, targetListing, offeredListing, profileMap, myRole } = detail.data;
  const status = SWAP_STATUS[request.status] ?? { label: request.status, tone: "gray" as const };
  const myConfirmed = myRole === "requester" ? request.requesterConfirmed : request.ownerConfirmed;

  const refresh = async () => {
    await Promise.all([
      utils.swaps.detail.invalidate({ id }),
      utils.swaps.list.invalidate(),
      utils.listings.list.invalidate(),
      utils.orders.list.invalidate(),
    ]);
  };

  const run = async () => {
    if (!pendingAction) return;
    try {
      setError("");
      if (pendingAction === "accept" || pendingAction === "reject") await respond.mutateAsync({ id, accept: pendingAction === "accept" });
      else if (pendingAction === "cancel") await cancel.mutateAsync({ id });
      else await confirm.mutateAsync({ id });
      setPendingAction(null);
      await refresh();
    } catch (cause) {
      setPendingAction(null);
      setError(cause instanceof Error ? cause.message : "操作失败，请刷新后重试");
    }
  };

  const stepText = request.status === "submitted"
    ? myRole === "owner" ? "对方已发起置换，请核对两件物品后接受或拒绝。" : "请求已发送，等待物品发布者处理。"
    : request.status === "awaiting_confirmations"
      ? myConfirmed ? "你已确认，等待对方确认。" : "请在线下核对并交付物品后确认；双方确认后所有权将更新。"
      : request.status === "completed" ? "双方均已确认，置换完成。" : "本次置换已结束，物品不会继续锁定。";

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <StatusBadge label={status.label} tone={status.tone} />
          <Text className="text-sm text-foreground leading-6 mt-3">{stepText}</Text>
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-xs text-muted">发起方：{profileMap[request.requesterId]?.nickname ?? "用户"} · 物品发布者：{profileMap[request.ownerId]?.nickname ?? "用户"}</Text>
          </View>
        </View>

        {offeredListing ? <><Text className="text-sm font-semibold text-foreground mb-2">用于交换</Text><ListingCard listing={offeredListing} /></> : null}
        {targetListing ? <><Text className="text-sm font-semibold text-foreground mb-2">希望获得</Text><ListingCard listing={targetListing} /></> : null}

        {request.status === "awaiting_confirmations" ? (
          <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <Text className="text-sm font-semibold text-foreground mb-2">双方确认进度</Text>
            <Text className="text-sm text-muted">{request.requesterConfirmed ? "✓" : "○"} 发起方已确认</Text>
            <Text className="text-sm text-muted mt-1">{request.ownerConfirmed ? "✓" : "○"} 物品发布者已确认</Text>
          </View>
        ) : null}

        {error ? <Text className="text-sm text-error mb-3">{error}</Text> : null}
        {request.status === "submitted" && myRole === "owner" ? (
          <View className="gap-3"><PrimaryButton title="接受置换" onPress={() => setPendingAction("accept")} /><PrimaryButton title="拒绝" variant="muted" onPress={() => setPendingAction("reject")} /></View>
        ) : null}
        {request.status === "submitted" && myRole === "requester" ? <PrimaryButton title="取消请求" variant="muted" onPress={() => setPendingAction("cancel")} /> : null}
        {request.status === "awaiting_confirmations" ? (
          <View className="gap-3">
            {!myConfirmed ? <PrimaryButton title="确认已完成物品交付" onPress={() => setPendingAction("confirm")} /> : null}
            <PrimaryButton title="取消置换" variant="muted" onPress={() => setPendingAction("cancel")} />
          </View>
        ) : null}
      </ScrollView>
      <ConfirmDialog
        visible={pendingAction !== null}
        title={pendingAction === "accept" ? "接受置换" : pendingAction === "reject" ? "拒绝置换" : pendingAction === "confirm" ? "确认物品交付" : "取消置换"}
        message={pendingAction === "confirm" ? "请确认已经当面或通过约定方式核对并交付物品。双方确认后将更新物品所有权，此操作不可撤销。" : "系统会再次检查服务端状态，重复点击不会重复处理。"}
        confirmText="确认"
        danger={pendingAction === "reject" || pendingAction === "cancel"}
        loading={respond.isPending || cancel.isPending || confirm.isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={run}
      />
    </>
  );
}

export default function SwapDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="置换详情" />
      <AuthGate title="登录后查看置换"><SwapDetailInner /></AuthGate>
    </ScreenContainer>
  );
}
