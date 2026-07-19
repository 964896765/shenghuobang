import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { ListingImage } from "@/components/listing-images";
import { ScreenContainer } from "@/components/screen-container";
import { listingImageUrl } from "@/lib/listing-images";
import { formatTime, SWAP_STATUS } from "@/lib/labels";
import { trpc } from "@/lib/trpc";

function MySwapsInner() {
  const router = useRouter();
  const swaps = trpc.swaps.list.useQuery();
  if (swaps.isLoading) return <LoadingView />;
  if (swaps.isError) return <ErrorState title="无法加载置换请求" hint={swaps.error.message} onRetry={() => swaps.refetch()} />;

  return (
    <FlatList
      data={swaps.data ?? []}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={swaps.isRefetching} onRefresh={() => swaps.refetch()} />}
      ListEmptyComponent={<EmptyState title="还没有置换请求" hint="在支持置换的物品详情页，可以选择自己的物品发起置换。" />}
      renderItem={({ item }) => {
        const status = SWAP_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
        return (
          <Pressable onPress={() => router.push(`/swaps/${item.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
            <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row justify-between items-center mb-3">
                <StatusBadge label={status.label} tone={status.tone} small />
                <Text className="text-xs text-muted">{formatTime(item.updatedAt)}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <ListingImage uri={item.offeredListing?.imageUrls?.[0] ? listingImageUrl(item.offeredListing.imageUrls[0]) : undefined} className="w-16 h-16 rounded-xl" />
                <Text className="text-lg text-muted">↔</Text>
                <ListingImage uri={item.targetListing?.imageUrls?.[0] ? listingImageUrl(item.targetListing.imageUrls[0]) : undefined} className="w-16 h-16 rounded-xl" />
                <View className="flex-1 ml-1">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.offeredListing?.title ?? "物品已不可见"}</Text>
                  <Text className="text-xs text-muted my-1">置换</Text>
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.targetListing?.title ?? "物品已不可见"}</Text>
                </View>
              </View>
              <Text className="text-xs text-muted mt-3">{item.myRole === "requester" ? "我发起的请求" : "我收到的请求"}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export default function MySwapsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的置换" />
      <AuthGate title="登录后查看置换请求"><MySwapsInner /></AuthGate>
    </ScreenContainer>
  );
}
