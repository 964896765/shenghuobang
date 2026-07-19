import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { RECYCLING_STATUS, formatTime } from "@/lib/labels";

function MyRecyclingInner() {
  const router = useRouter();
  const requests = trpc.recycling.myRequests.useQuery();

  if (requests.isLoading) return <LoadingView />;
  if (requests.isError) return <ErrorState title="无法加载回收询价" hint={requests.error.message} onRetry={() => requests.refetch()} />;

  return (
    <FlatList
      data={requests.data ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
      refreshControl={<RefreshControl refreshing={requests.isRefetching} onRefresh={() => requests.refetch()} />}
      ListEmptyComponent={
        <EmptyState
          title="还没有回收询价"
          hint="旧家电、废旧物品,发布询价让商家上门回收。"
          actionTitle="发布回收询价"
          onAction={() => router.push("/recycling/create" as any)}
        />
      }
      renderItem={({ item }) => {
        const st = RECYCLING_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
        return (
          <Pressable onPress={() => router.push(`/recycling/${item.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
              <View className="flex-row items-center justify-between mb-1.5">
                <StatusBadge label={st.label} tone={st.tone} small />
                <Text className="text-xs text-muted">{formatTime(item.createdAt)}</Text>
              </View>
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {item.title}
              </Text>
              <View className="flex-row items-center justify-between mt-1.5">
                <Text className="text-xs text-muted">{item.category}</Text>
                <Text className="text-xs text-muted">{item.expectedPrice ? `期望 ¥${item.expectedPrice}` : "由商家报价"}</Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export default function MyRecyclingScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的回收" />
      <AuthGate title="登录后查看回收询价">
        <MyRecyclingInner />
      </AuthGate>
    </ScreenContainer>
  );
}
