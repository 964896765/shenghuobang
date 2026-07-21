import { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  FUNDING_STATUS_LABELS,
  StableFundingRequestIds,
  formatFundingDate,
  fundingErrorMessage,
  fundingProgress,
  type FundingCampaignStatus,
} from "@/lib/funding-app";
import { trpc } from "@/lib/trpc";

function statusTone(status: string): "gray" | "blue" | "green" | "orange" {
  if (status === "succeeded" || status === "active") return status === "succeeded" ? "green" : "blue";
  if (["failed", "cancelled", "withdrawn"].includes(status)) return "orange";
  return "gray";
}

function MyFundingContent() {
  const router = useRouter();
  const requests = useRef(new StableFundingRequestIds()).current;
  const utils = trpc.useUtils();
  const campaigns = trpc.fundingCampaigns.myList.useQuery();
  const pledges = trpc.fundingPledges.myList.useQuery();
  const withdrawMutation = trpc.fundingPledges.withdraw.useMutation();
  const [error, setError] = useState("");

  const refresh = async () => {
    await Promise.all([campaigns.refetch(), pledges.refetch()]);
  };

  const withdraw = async (pledgeId: number) => {
    const operation = `withdraw-${pledgeId}`;
    try {
      await withdrawMutation.mutateAsync({ pledgeId, requestId: requests.get(operation) });
      requests.complete(operation);
      setError("");
      await Promise.all([
        utils.fundingPledges.myList.invalidate(),
        utils.fundingCampaigns.publicList.invalidate(),
        utils.fundingCampaigns.publicDetail.invalidate(),
        utils.fundingCampaigns.publicTimeline.invalidate(),
      ]);
    } catch (cause) {
      setError(fundingErrorMessage(cause));
    }
  };

  if (campaigns.isLoading || pledges.isLoading) return <LoadingView text="正在加载我的筹措记录…" />;
  if (campaigns.isError || pledges.isError) {
    return <ErrorState title="无法加载筹措记录" hint={fundingErrorMessage(campaigns.error ?? pledges.error)} onRetry={refresh} />;
  }

  const myCampaigns = campaigns.data ?? [];
  const myPledges = pledges.data ?? [];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={campaigns.isRefetching || pledges.isRefetching} onRefresh={refresh} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
    >
      <PrimaryButton title="发起新品筹措" onPress={() => router.push("/funding/new" as never)} />
      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <Text className="text-xl font-bold text-foreground mt-7 mb-3">我发起的活动</Text>
      {myCampaigns.length === 0 ? <EmptyState title="还没有发起筹措" hint="从你的需求或创意出发，先验证真实意向。" /> : myCampaigns.map((campaign) => {
        const status = campaign.status as FundingCampaignStatus;
        const progress = fundingProgress(campaign.pledgedQuantity, campaign.goalQuantity);
        return (
          <Pressable key={campaign.id} onPress={() => router.push(`/funding/manage/${campaign.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <StatusBadge label={FUNDING_STATUS_LABELS[status]} tone={statusTone(status)} />
                <Text className="text-xs text-muted">更新 {formatFundingDate(campaign.updatedAt)}</Text>
              </View>
              <Text className="text-lg font-bold text-foreground mt-3">{campaign.title}</Text>
              <Text className="text-sm text-muted mt-2" numberOfLines={2}>{campaign.summary}</Text>
              <View className="h-2 bg-border rounded-full overflow-hidden mt-4"><View className="h-2 bg-primary" style={{ width: `${progress}%` }} /></View>
              <Text className="text-sm text-foreground mt-2">{campaign.pledgedQuantity} / {campaign.goalQuantity} 份 · {campaign.activePledgeCount} 位支持者</Text>
            </View>
          </Pressable>
        );
      })}

      <Text className="text-xl font-bold text-foreground mt-7 mb-3">我的支持意向</Text>
      {myPledges.length === 0 ? <EmptyState title="还没有支持意向" hint="浏览公开新品筹措，登记真实需要数量。" /> : myPledges.map((pledge) => (
        <View key={pledge.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <Pressable onPress={() => router.push(`/funding/${pledge.campaignPublicCode}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <View className="flex-row items-center justify-between gap-3">
              <StatusBadge label={pledge.status === "active" ? "有效意向" : "已撤回"} tone={statusTone(pledge.status)} />
              <Text className="text-xs text-muted">{formatFundingDate(pledge.updatedAt)}</Text>
            </View>
            <Text className="text-lg font-bold text-foreground mt-3">{pledge.campaignTitle}</Text>
            <Text className="text-sm text-foreground mt-2">支持数量：{pledge.quantity} 份{pledge.cityName ? ` · ${pledge.cityName}` : ""}</Text>
            {pledge.note ? <Text className="text-sm text-muted mt-2" numberOfLines={3}>{pledge.note}</Text> : null}
          </Pressable>
          {pledge.status === "active" && pledge.campaignStatus === "active" ? (
            <View className="mt-4"><PrimaryButton title="撤回支持意向" variant="outline" disabled={withdrawMutation.isPending} loading={withdrawMutation.isPending} onPress={() => withdraw(pledge.id)} /></View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

export default function MyFundingScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="我的筹措" />
      <AuthGate title="登录后查看筹措记录"><MyFundingContent /></AuthGate>
    </ScreenContainer>
  );
}
