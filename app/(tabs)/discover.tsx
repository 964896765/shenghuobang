import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { NeedCard, EngineerCard, ListingCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, StatusBadge, AppTextInput } from "@/components/common";
import { AuthGate } from "@/components/auth-gate";
import { RECYCLING_STATUS, formatTime } from "@/lib/labels";
import { USER_DISCOVER_TABS } from "@/lib/discover-tabs";
import { ForegroundLocationCard } from "@/components/foreground-location-card";
import { useForegroundLocation } from "@/hooks/use-foreground-location";

function TabBar({ tabs, active, onChange }: { tabs: readonly { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <View className="flex-row px-4 gap-2 pb-2">
      {tabs.map((t) => (
        <Pressable key={t.key} onPress={() => onChange(t.key)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <View className={t.key === active ? "bg-primary rounded-full px-4 py-1.5" : "bg-surface border border-border rounded-full px-4 py-1.5"}>
            <Text className={t.key === active ? "text-white text-sm font-medium" : "text-foreground text-sm"}>{t.label}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function UserDiscover() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<string>(params.tab ?? "needs");
  const [keyword, setKeyword] = useState("");
  const location = useForegroundLocation();

  const needs = trpc.needs.list.useQuery({ scope: "plaza", keyword: keyword || undefined, ...location.queryInput }, { enabled: tab === "needs" });
  const engineers = trpc.engineers.list.useQuery({ keyword: keyword || undefined, ...location.queryInput }, { enabled: tab === "engineers" });
  const listings = trpc.listings.list.useQuery(
    { scope: "market", keyword: keyword || undefined, mode: tab === "giveaway" ? "giveaway" : undefined, ...location.queryInput },
    { enabled: tab === "listings" || tab === "giveaway" },
  );
  const openRequests = trpc.recycling.openRequests.useQuery(location.queryInput, { enabled: tab === "recycling" });

  const loading = needs.isLoading || engineers.isLoading || listings.isLoading || openRequests.isLoading;
  const activeQuery = tab === "needs" ? needs : tab === "engineers" ? engineers : tab === "recycling" ? openRequests : listings;

  return (
    <View className="flex-1">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground mb-3">发现</Text>
        <AppTextInput placeholder="搜索需求、工程师或物品" value={keyword} onChangeText={setKeyword} />
      </View>
      <ForegroundLocationCard compact controller={location} />
      <TabBar tabs={USER_DISCOVER_TABS} active={tab} onChange={setTab} />
      {loading ? (
        <LoadingView />
      ) : activeQuery.isError ? (
        <ErrorState title="加载失败" hint={activeQuery.error.message} onRetry={() => activeQuery.refetch()} />
      ) : tab === "needs" ? (
        <FlatList
          data={needs.data ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <NeedCard need={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={needs.isRefetching} onRefresh={() => needs.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无需求" hint="附近还没有公开需求,发布一个试试。" />}
        />
      ) : tab === "engineers" ? (
        <FlatList
          data={engineers.data ?? []}
          keyExtractor={(i) => String(i.userId)}
          renderItem={({ item }) => <EngineerCard engineer={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={engineers.isRefetching} onRefresh={() => engineers.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无工程师" hint="附近的认证工程师会显示在这里。" />}
        />
      ) : tab === "recycling" ? (
        <FlatList
          data={openRequests.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={openRequests.isRefetching} onRefresh={() => openRequests.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无回收询价" hint="已发布的回收询价会显示在这里。" />}
          renderItem={({ item }) => {
            const status = RECYCLING_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
            return (
              <Pressable
                onPress={() => router.push(`/recycling/${item.id}` as any)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <StatusBadge label={status.label} tone={status.tone} small />
                    <Text className="text-xs text-muted">{formatTime(item.createdAt)}</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{item.title}</Text>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-xs text-muted">{item.category}</Text>
                    <Text className="text-xs text-muted">{item.cityName}</Text>
                    {item.expectedPrice ? <Text className="text-xs text-action">期望 ¥{item.expectedPrice}</Text> : null}
                    {item.distanceLabel ? <Text className="text-xs text-primary">{item.distanceLabel}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={listings.data ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <ListingCard listing={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={listings.isRefetching} onRefresh={() => listings.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无物品" hint={tab === "giveaway" ? "还没有免费赠送的物品。" : "附近还没有在售物品。"} />}
        />
      )}
    </View>
  );
}

function EngineerHall() {
  const [keyword, setKeyword] = useState("");
  const location = useForegroundLocation();
  const needs = trpc.needs.list.useQuery({ scope: "plaza", keyword: keyword || undefined, ...location.queryInput });
  return (
    <View className="flex-1">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground mb-3">需求大厅</Text>
        <AppTextInput placeholder="搜索需求关键词" value={keyword} onChangeText={setKeyword} />
      </View>
      <ForegroundLocationCard compact controller={location} />
      {needs.isLoading ? (
        <LoadingView />
      ) : needs.isError ? (
        <ErrorState title="无法加载需求" hint={needs.error.message} onRetry={() => needs.refetch()} />
      ) : (
        <FlatList
          data={needs.data ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <NeedCard need={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={needs.isRefetching} onRefresh={() => needs.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无公开需求" hint="有新需求发布时会显示在这里。" />}
        />
      )}
    </View>
  );
}

function MerchantInquiries() {
  const router = useRouter();
  const location = useForegroundLocation();
  const openRequests = trpc.recycling.openRequests.useQuery(location.queryInput);
  return (
    <View className="flex-1">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground">附近询价</Text>
        <Text className="text-sm text-muted mt-1">用户发布的回收询价,提交报价争取订单</Text>
      </View>
      <ForegroundLocationCard compact controller={location} />
      {openRequests.isLoading ? (
        <LoadingView />
      ) : openRequests.isError ? (
        <ErrorState title="无法加载回收询价" hint={openRequests.error.message} onRetry={() => openRequests.refetch()} />
      ) : (
        <FlatList
          data={openRequests.data ?? []}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={openRequests.isRefetching} onRefresh={() => openRequests.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无待报价询价" hint="有用户发布回收询价时会显示在这里。" />}
          renderItem={({ item }) => {
            const st = RECYCLING_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
            return (
              <Pressable onPress={() => router.push(`/recycling/${item.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <StatusBadge label={st.label} tone={st.tone} small />
                    <Text className="text-xs text-muted">{formatTime(item.createdAt)}</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{item.title}</Text>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-xs text-muted">{item.category}</Text>
                    <Text className="text-xs text-muted">{item.cityName}</Text>
                    {item.expectedPrice ? <Text className="text-xs text-action">期望 ¥{item.expectedPrice}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

export default function DiscoverScreen() {
  const { role, isAuthenticated } = useRole();
  return (
    <ScreenContainer>
      {role === "engineer" && isAuthenticated ? (
        <EngineerHall />
      ) : role === "merchant" && isAuthenticated ? (
        <AuthGate>
          <MerchantInquiries />
        </AuthGate>
      ) : (
        <UserDiscover />
      )}
    </ScreenContainer>
  );
}
