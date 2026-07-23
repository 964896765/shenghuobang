import React from "react";
import { ScrollView, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { creditLevel, formatTime } from "@/lib/labels";

function CreditsInner() {
  const data = trpc.credits.me.useQuery();

  if (data.isLoading) return <LoadingView />;
  if (data.isError) {
    return (
      <ErrorState
        title="信用数据加载失败"
        hint="请检查网络连接后重试"
        onRetry={() => void data.refetch()}
      />
    );
  }
  if (!data.data) return <EmptyState title="暂无信用数据" />;

  const { creditScore, events, reviews } = data.data;
  const level = creditLevel(creditScore ?? 100);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
      <View className="bg-primary rounded-2xl p-6 items-center">
        <Text className="text-white/80 text-sm">当前信用分</Text>
        <Text className="text-white text-5xl font-bold mt-1">{creditScore ?? 100}</Text>
        <View className="bg-white/20 rounded-full px-3 py-1 mt-2">
          <Text className="text-white text-sm">{level.label}</Text>
        </View>
        <Text className="text-white/70 text-xs mt-3 text-center leading-4">
          信用分由平台根据履约、评价、投诉等行为记录自动计算,影响接单与曝光。
        </Text>
      </View>

      <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
        <Text className="text-base font-semibold text-foreground mb-2">信用记录</Text>
        {events.length === 0 ? (
          <Text className="text-sm text-muted">暂无信用记录,保持良好履约即可积累信用。</Text>
        ) : (
          events.map((e) => (
            <View key={e.id} className="flex-row items-center py-2.5 border-b border-border">
              <View className="flex-1">
                <Text className="text-sm text-foreground">{e.reason}</Text>
                <Text className="text-xs text-muted mt-0.5">{formatTime(e.createdAt)}</Text>
              </View>
              <Text className={e.scoreChange >= 0 ? "text-base font-bold text-primary" : "text-base font-bold text-error"}>
                {e.scoreChange >= 0 ? `+${e.scoreChange}` : e.scoreChange}
              </Text>
            </View>
          ))
        )}
      </View>

      <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
        <Text className="text-base font-semibold text-foreground mb-2">收到的评价 {reviews.length}</Text>
        {reviews.length === 0 ? (
          <Text className="text-sm text-muted">暂无评价</Text>
        ) : (
          reviews.map((r) => (
            <View key={r.id} className="py-2.5 border-b border-border">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-warning">{"★".repeat(r.overallRating)}{"☆".repeat(5 - r.overallRating)}</Text>
                <Text className="text-xs text-muted">{formatTime(r.createdAt)}</Text>
              </View>
              {r.content ? <Text className="text-sm text-foreground mt-1 leading-5">{r.content}</Text> : null}
              {r.tags?.length ? <Text className="text-xs text-primary mt-1">{r.tags.join(" · ")}</Text> : null}
              <Text className="text-xs text-muted mt-1">来源：{r.businessSource} · 影响维度：{r.impactDimension}</Text>
              {r.reply ? <Text className="text-sm text-muted mt-2">回复：{r.reply}</Text> : null}
            </View>
          ))
        )}
      </View>

      <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
        <Text className="text-sm font-semibold text-foreground mb-1">信用等级说明</Text>
        <View className="flex-row items-center gap-2 py-1">
          <StatusBadge label="信用良好" tone="green" small />
          <Text className="text-xs text-muted">110 分及以上</Text>
        </View>
        <View className="flex-row items-center gap-2 py-1">
          <StatusBadge label="信用正常" tone="blue" small />
          <Text className="text-xs text-muted">90 - 109 分</Text>
        </View>
        <View className="flex-row items-center gap-2 py-1">
          <StatusBadge label="信用需关注" tone="yellow" small />
          <Text className="text-xs text-muted">70 - 89 分</Text>
        </View>
        <View className="flex-row items-center gap-2 py-1">
          <StatusBadge label="高风险" tone="red" small />
          <Text className="text-xs text-muted">70 分以下,将限制部分功能</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export default function CreditsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="信用中心" />
      <AuthGate title="登录后查看信用">
        <CreditsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
