import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { NeedCard, EngineerCard, ListingCard } from "@/components/cards";
import { IdeaCard } from "@/components/idea-card";
import { EmptyState, ErrorState, LoadingView, StatusBadge, AppTextInput } from "@/components/common";
import { AuthGate } from "@/components/auth-gate";
import { RECYCLING_STATUS, formatTime } from "@/lib/labels";
import { USER_DISCOVER_TABS } from "@/lib/discover-tabs";

import { useForegroundLocation } from "@/hooks/use-foreground-location";
import { asIdeaListItems } from "@/lib/idea-app";
import { FUNDING_STATUS_LABELS, fundingProgress, type FundingCampaignStatus } from "@/lib/funding-app";
import { startLogin } from "@/constants/app";

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
  const { isAuthenticated } = useRole();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<string>(params.tab ?? "needs");
  const [keyword, setKeyword] = useState("");
  const location = useForegroundLocation();
  const ideas = trpc.ideas.listPublic.useQuery({ limit: 20 }, { enabled: tab === "ideas" && isAuthenticated });
  const funding = trpc.fundingCampaigns.publicList.useQuery({ limit: 20 }, { enabled: tab === "funding" });
  const ideaRows = useMemo(() => {
    const rows = asIdeaListItems(ideas.data ?? []);
    const normalized = keyword.trim().toLocaleLowerCase();
    if (!normalized) return rows;
    return rows.filter((item) => [item.title, item.summary, ...(item.tags ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [ideas.data, keyword]);
  const fundingRows = useMemo(() => {
    const rows = funding.data?.items ?? [];
    const normalized = keyword.trim().toLocaleLowerCase();
    if (!normalized) return rows;
    return rows.filter((item) => [item.title, item.summary, item.categoryCode]
      .some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [funding.data, keyword]);

  const needs = trpc.needs.list.useQuery({ scope: "plaza", keyword: keyword || undefined, ...location.queryInput }, { enabled: tab === "needs" });
  const engineers = trpc.engineers.list.useQuery({ keyword: keyword || undefined, ...location.queryInput }, { enabled: tab === "engineers" });
  const listings = trpc.listings.list.useQuery(
    { scope: "market", keyword: keyword || undefined, mode: tab === "giveaway" ? "giveaway" : undefined, ...location.queryInput },
    { enabled: tab === "listings" || tab === "giveaway" },
  );
  const openRequests = trpc.recycling.openRequests.useQuery(location.queryInput, { enabled: tab === "recycling" });

  const loading = ideas.isLoading || funding.isLoading || needs.isLoading || engineers.isLoading || listings.isLoading || openRequests.isLoading;
  const activeQuery = tab === "ideas" ? ideas : tab === "funding" ? funding : tab === "needs" ? needs : tab === "engineers" ? engineers : tab === "recycling" ? openRequests : listings;

  return (
    <View className="flex-1">
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground mb-1">发现</Text>
        <Text className="text-sm text-muted mb-3">从真实需求、公开创意和新品筹措出发，发现可信的人、物品和循环服务。</Text>
        <AppTextInput placeholder="搜索创意、筹措、需求、工程师或物品" value={keyword} onChangeText={setKeyword} />
      </View>
      <TabBar tabs={USER_DISCOVER_TABS} active={tab} onChange={setTab} />
      {loading ? (
        <LoadingView />
      ) : activeQuery.isError ? (
        <ErrorState title="加载失败" hint={activeQuery.error.message} onRetry={() => activeQuery.refetch()} />
      ) : tab === "ideas" ? (
        !isAuthenticated ? (
          <EmptyState title="登录后发现创意" hint="公开创意仍需登录访问，平台会按授权规则返回可见字段。" actionTitle="登录" onAction={startLogin} />
        ) : (
          <FlatList
            data={ideaRows}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <IdeaCard idea={item} />}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={ideas.isRefetching} onRefresh={() => ideas.refetch()} />}
            ListEmptyComponent={<EmptyState title="暂无匹配创意" hint={keyword ? "换一个关键词试试。" : "成为第一个发布公开创意的人。"} actionTitle="发布创意" onAction={() => router.push("/ideas/edit" as never)} />}
          />
        )
      ) : tab === "funding" ? (
        <FlatList
          data={fundingRows}
          keyExtractor={(item) => item.publicCode}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={funding.isRefetching} onRefresh={() => funding.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无匹配筹措" hint={keyword ? "换一个关键词试试。" : "公开新品筹措会显示在这里。"} actionTitle="发起筹措" onAction={() => router.push("/funding/new" as never)} />}
          renderItem={({ item }) => {
            const status = item.status as FundingCampaignStatus;
            const progress = fundingProgress(item.pledgedQuantity, item.goalQuantity);
            return (
              <Pressable onPress={() => router.push(`/funding/${item.publicCode}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
                <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View className="flex-row items-center justify-between gap-3">
                    <StatusBadge label={FUNDING_STATUS_LABELS[status]} tone={status === "succeeded" ? "green" : status === "active" ? "blue" : "gray"} small />
                    <Text className="text-xs text-muted">{item.sourceType === "idea" ? "创意来源" : "需求来源"}</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground mt-2" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-sm text-muted mt-1" numberOfLines={2}>{item.summary}</Text>
                  <View className="h-2 bg-border rounded-full overflow-hidden mt-3"><View className="h-2 bg-primary" style={{ width: `${progress}%` }} /></View>
                  <Text className="text-xs text-foreground mt-2">{item.pledgedQuantity} / {item.goalQuantity} 份 · {item.activePledgeCount} 位支持者</Text>
                </View>
              </Pressable>
            );
          }}
        />
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
      <View className="flex-1">
        {role === "engineer" && isAuthenticated ? (
            <EngineerHall />
          ) : role === "merchant" && isAuthenticated ? (
            <AuthGate>
              <MerchantInquiries />
            </AuthGate>
          ) : (
            <UserDiscover />
        )}
      </View>
    </ScreenContainer>
  );
}
