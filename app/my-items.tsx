import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";

const statusLabel: Record<string, string> = {
  in_use: "使用中", idle: "闲置", listed: "发布中", reserved: "已预订", sold: "已出售",
  swapped: "已置换", given_away: "已赠送", recycling: "回收中", recycled: "已回收",
  under_repair: "维修中", archived: "已归档",
};

function Content() {
  const query = trpc.items.mine.useQuery();
  if (query.isLoading) return <LoadingView />;
  if (query.isError) return <ErrorState title="无法加载物品档案" hint={query.error.message} onRetry={() => query.refetch()} />;
  return <FlatList
    data={query.data ?? []}
    keyExtractor={(item) => String(item.id)}
    contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
    ListEmptyComponent={<EmptyState title="还没有独立物品档案" hint="发布旧物时会自动建立物品档案，并保留维修、发布和所有权历史。" />}
    renderItem={({ item }) => (
      <Pressable onPress={() => router.push(`/items/${item.id}` as never)} className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">{item.title}</Text>
            <Text className="text-xs text-muted mt-1">{item.brand || item.category || "其他"} · {item.conditionLevel || "状态未填写"}</Text>
          </View>
          <StatusBadge label={statusLabel[item.status] ?? item.status} tone={item.status === "listed" ? "blue" : item.status === "sold" || item.status === "recycled" ? "green" : "gray"} small />
        </View>
      </Pressable>
    )}
  />;
}

export default function MyItemsScreen() {
  return <ScreenContainer><PageHeader title="我的物品档案" /><AuthGate title="登录后查看物品档案"><Content /></AuthGate></ScreenContainer>;
}
