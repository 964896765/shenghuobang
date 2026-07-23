import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { startLogin } from "@/constants/app";
import { useRole } from "@/lib/role-context";
import {
  FUNDING_STATUS_LABELS,
  formatFundingDate,
  fundingErrorMessage,
  fundingProgress,
  type FundingCampaignStatus,
} from "@/lib/funding-app";
import { trpc } from "@/lib/trpc";

function statusTone(status: FundingCampaignStatus): "gray" | "blue" | "green" | "orange" {
  if (status === "succeeded") return "green";
  if (status === "active") return "blue";
  if (status === "failed" || status === "cancelled") return "orange";
  return "gray";
}

export default function FundingCampaignListScreen() {
  const router = useRouter();
  const { isAuthenticated } = useRole();
  const campaigns = trpc.fundingCampaigns.publicList.useQuery({ limit: 30 });

  if (campaigns.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="新品筹措" />
        <LoadingView text="正在加载筹措活动…" />
      </ScreenContainer>
    );
  }

  if (campaigns.isError) {
    return (
      <ScreenContainer>
        <PageHeader title="新品筹措" />
        <ErrorState title="无法加载筹措活动" hint={fundingErrorMessage(campaigns.error)} onRetry={() => campaigns.refetch()} />
      </ScreenContainer>
    );
  }

  const rows = campaigns.data?.items ?? [];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="新品筹措" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={campaigns.isRefetching} onRefresh={() => campaigns.refetch()} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-lg font-bold text-foreground">先验证真实意向，再进入生产</Text>
          <Text className="text-sm text-muted leading-6 mt-2">
            这里登记的是非支付支持意向，不会扣款。每个活动保留需求或创意来源、核验依据、风险和公开进度。
          </Text>
          <View className="mt-3">
            <PrimaryButton
              title="从我的需求或创意发起"
              onPress={() => (isAuthenticated ? router.push("/funding/new" as never) : startLogin())}
            />
          </View>
        </View>

        {rows.length === 0 ? (
          <EmptyState title="暂无公开筹措活动" hint="活动通过服务端发布门禁后会显示在这里。" />
        ) : rows.map((campaign) => {
          const status = campaign.status as FundingCampaignStatus;
          const progress = fundingProgress(campaign.pledgedQuantity, campaign.goalQuantity);
          return (
            <Pressable
              key={campaign.publicCode}
              onPress={() => router.push(`/funding/${campaign.publicCode}` as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
                <View className="flex-row items-center justify-between gap-3">
                  <StatusBadge label={FUNDING_STATUS_LABELS[status]} tone={statusTone(status)} />
                  <Text className="text-xs text-muted">截止 {formatFundingDate(campaign.endsAt)}</Text>
                </View>
                <Text className="text-lg font-bold text-foreground mt-3">{campaign.title}</Text>
                <Text className="text-sm text-muted leading-6 mt-2" numberOfLines={3}>{campaign.summary}</Text>
                <View className="h-2 bg-border rounded-full overflow-hidden mt-4">
                  <View className="h-2 bg-primary rounded-full" style={{ width: `${progress}%` }} />
                </View>
                <View className="flex-row justify-between mt-2">
                  <Text className="text-sm font-semibold text-foreground">{campaign.pledgedQuantity} / {campaign.goalQuantity} 份意向</Text>
                  <Text className="text-sm text-primary font-semibold">{progress}%</Text>
                </View>
                <Text className="text-xs text-muted mt-2">{campaign.activePledgeCount} 位支持者 · {campaign.categoryCode}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
