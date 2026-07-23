import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PageHeader } from "@/components/auth-gate";
import { ListingCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { useGlobalLocation } from "@/lib/location-context";
import { trpc } from "@/lib/trpc";

export default function DonationHubScreen() {
  const router = useRouter();
  const location = useGlobalLocation();
  const listings = trpc.listings.list.useQuery({ scope: "market", mode: "giveaway", ...location.queryInput });
  return (
    <ScreenContainer>
      <PageHeader title="捐赠与赠送" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Text className="text-base font-bold text-foreground">{location.region || "当前城市"} · 公益流转</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">每件物品进入真实赠送详情和申请流程，完成后保留订单与流转记录。</Text>
          <View className="mt-3 flex-row gap-2">
            <View className="flex-1"><PrimaryButton title="发布捐赠" onPress={() => router.push("/listings/create?mode=giveaway" as never)} /></View>
            <View className="flex-1"><PrimaryButton variant="outline" title="我的发布" onPress={() => router.push("/my-listings" as never)} /></View>
          </View>
        </View>
        <Text className="mb-2 mt-5 text-lg font-bold text-foreground">附近可领取物品</Text>
        {listings.isLoading ? <LoadingView /> : listings.isError ? <ErrorState title="捐赠信息加载失败" hint="请检查网络后重试" onRetry={() => void listings.refetch()} /> : (listings.data ?? []).length ? (listings.data ?? []).map((listing) => <ListingCard key={listing.id} listing={listing} />) : <EmptyState title="当前城市暂无捐赠物品" hint="你可以发布第一件免费赠送物品。" actionTitle="发布捐赠" onAction={() => router.push("/listings/create?mode=giveaway" as never)} />}
      </ScrollView>
    </ScreenContainer>
  );
}
