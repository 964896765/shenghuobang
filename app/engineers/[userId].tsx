import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { Avatar, EmptyState, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { formatTime } from "@/lib/labels";
import { useAuth } from "@/hooks/use-auth";
import { startLogin } from "@/constants/app";

export default function EngineerDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const uid = Number(userId);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const detail = trpc.engineers.detail.useQuery({ userId: uid }, { enabled: !Number.isNaN(uid) });
  const startChat = trpc.messagesRouter.start.useMutation({
    onSuccess: (res) => router.push(`/chat/${res.conversationId}` as any),
  });

  if (detail.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="工程师主页" />
        <LoadingView />
      </ScreenContainer>
    );
  }
  if (!detail.data) {
    return (
      <ScreenContainer>
        <PageHeader title="工程师主页" />
        <EmptyState title="工程师不存在" />
      </ScreenContainer>
    );
  }

  const { engineer, reviews } = detail.data;
  const skills: string[] = (engineer.skills as string[] | null) ?? [];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="工程师主页" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <View className="bg-surface rounded-2xl border border-border p-4 items-center">
          <Avatar name={engineer.realName ?? "工"} size={64} />
          <Text className="text-xl font-bold text-foreground mt-2">{engineer.realName ?? "认证工程师"}</Text>
          <Text className="text-sm text-muted mt-1">{engineer.professionalTitle ?? engineer.primaryCategory ?? "工程师"}</Text>
          <View className="flex-row items-center gap-2 mt-2">
            <StatusBadge label="已认证" tone="green" small />
            {engineer.acceptingOrders ? <StatusBadge label="接单中" tone="blue" small /> : <StatusBadge label="暂停接单" tone="gray" small />}
            <Text className="text-xs text-muted">{engineer.yearsOfExperience ?? 0} 年经验</Text>
          </View>
          <View className="flex-row gap-6 mt-3">
            <View className="items-center">
              <Text className="text-lg font-bold text-primary">{engineer.completedProjects ?? 0}</Text>
              <Text className="text-xs text-muted">完成项目</Text>
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold text-accent">{engineer.rating ? (engineer.rating / 10).toFixed(1) : "—"}</Text>
              <Text className="text-xs text-muted">平均评分</Text>
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold text-action">{reviews.length}</Text>
              <Text className="text-xs text-muted">收到评价</Text>
            </View>
          </View>
        </View>

        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-sm font-semibold text-foreground mb-2">专业信息</Text>
          <InfoRow label="专业方向" value={engineer.primaryCategory} />
          <InfoRow label="服务城市" value={engineer.cityName} />
          <InfoRow label="服务方式" value={[engineer.supportsRemote ? "支持远程" : "", engineer.supportsOnsite ? "支持上门" : ""].filter(Boolean).join(" · ") || "线上沟通"} />
          {skills.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {skills.map((s) => (
                <View key={s} className="bg-primary/10 rounded-full px-3 py-1">
                  <Text className="text-xs text-primary">{s}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {engineer.introduction ? <Text className="text-sm text-foreground leading-5 mt-2">{engineer.introduction}</Text> : null}
        </View>

        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-sm font-semibold text-foreground mb-2">用户评价 {reviews.length}</Text>
          {reviews.length === 0 ? (
            <Text className="text-sm text-muted">暂无评价</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} className="py-2 border-b border-border">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">{"★".repeat(r.overallRating)}{"☆".repeat(5 - r.overallRating)}</Text>
                  <Text className="text-xs text-muted">{formatTime(r.createdAt)}</Text>
                </View>
                {r.content ? <Text className="text-sm text-foreground mt-1 leading-5">{r.content}</Text> : null}
              </View>
            ))
          )}
        </View>

        {user?.id !== engineer.userId ? (
          <View className="mt-4">
            <PrimaryButton
              title="联系工程师"
              onPress={() => (isAuthenticated ? startChat.mutate({ targetUserId: engineer.userId, refType: "engineer", refId: engineer.userId }) : startLogin())}
              loading={startChat.isPending}
            />
            <Text className="text-xs text-muted text-center mt-2">建议先描述你的问题,或直接发布需求邀请工程师报价</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
