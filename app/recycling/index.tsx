import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useGlobalLocation } from "@/lib/location-context";
import { trpc } from "@/lib/trpc";

export default function RecyclingHubScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const location = useGlobalLocation();
  const merchants = trpc.merchants.list.useQuery();
  const mine = trpc.recycling.myRequests.useQuery(undefined, { enabled: isAuthenticated });
  return (
    <ScreenContainer>
      <PageHeader title="可信回收" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Text className="text-base font-bold text-foreground">{location.region || "当前城市"} · 估价、报价与回收订单</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">提交物品状况后，由已入驻回收商报价；选中报价将生成真实回收订单。</Text>
          <View className="mt-3"><PrimaryButton title="发布回收询价" onPress={() => router.push("/recycling/create" as never)} /></View>
        </View>
        <Text className="mb-2 mt-5 text-lg font-bold text-foreground">入驻回收服务商</Text>
        {merchants.isLoading ? <LoadingView /> : merchants.isError ? <ErrorState title="服务商加载失败" hint="请检查网络后重试" onRetry={() => void merchants.refetch()} /> : merchants.data?.length ? merchants.data.map((merchant) => (
          <View key={merchant.id} className="mb-3 rounded-2xl border border-border bg-surface p-4">
            <View className="flex-row items-center justify-between"><Text className="font-bold text-foreground">{merchant.name}</Text><StatusBadge label={merchant.acceptingOrders ? "可接单" : "暂停接单"} tone={merchant.acceptingOrders ? "green" : "gray"} small /></View>
            <Text className="mt-1 text-sm text-muted">{merchant.categories?.join(" · ") || "综合回收"}</Text>
            <Text className="mt-1 text-xs text-muted">{merchant.cityName || location.region || "服务范围待确认"} · 完成 {merchant.completedOrders ?? 0} 单</Text>
          </View>
        )) : <EmptyState title="当前城市暂无入驻回收商" hint="仍可先发布询价，服务商入驻后会看到需求。" />}
        <Text className="mb-2 mt-5 text-lg font-bold text-foreground">我的回收询价</Text>
        {!isAuthenticated ? <EmptyState title="登录后查看回收进度" hint="登录后可发布询价、比较报价并进入回收订单。" actionTitle="去登录" onAction={() => router.push("/login" as never)} /> : mine.isLoading ? <LoadingView /> : mine.isError ? <ErrorState title="回收进度加载失败" hint="请检查网络后重试" onRetry={() => void mine.refetch()} /> : mine.data?.length ? mine.data.map((request) => (
          <Pressable key={request.id} onPress={() => router.push(`/recycling/${request.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <View className="mb-3 rounded-2xl border border-border bg-surface p-4"><Text className="font-bold text-foreground">{request.title}</Text><Text className="mt-1 text-sm text-muted">{request.category} · {request.cityName} · {request.status}</Text></View>
          </Pressable>
        )) : <EmptyState title="还没有回收询价" hint="发布物品状况后即可等待服务商报价。" actionTitle="发布询价" onAction={() => router.push("/recycling/create" as never)} />}
      </ScrollView>
    </ScreenContainer>
  );
}
