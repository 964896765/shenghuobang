import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { NeedCard, ListingCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { IdeaCard } from "@/components/idea-card";
import { ScreenContainer } from "@/components/screen-container";
import { SourceLabel } from "@/components/trust-ui";
import { startLogin } from "@/constants/app";
import { asIdeaListItems } from "@/lib/idea-app";
import { useGlobalLocation } from "@/lib/location-context";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { DISCOVER_CHANNELS } from "@/shared/navigation/appNavigation";

type Channel = (typeof DISCOVER_CHANNELS)[number]["id"];

export default function DiscoverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = DISCOVER_CHANNELS.some((item) => item.id === params.tab) ? params.tab as Channel : "recommended";
  const [channel, setChannel] = useState<Channel>(initial);
  const { isAuthenticated } = useRole();
  const location = useGlobalLocation();

  useEffect(() => {
    if (params.tab && DISCOVER_CHANNELS.some((item) => item.id === params.tab)) setChannel(params.tab as Channel);
  }, [params.tab]);

  const feed = trpc.home.feed.useQuery(location.queryInput, { enabled: channel === "recommended" });
  const nearby = trpc.listings.list.useQuery({ scope: "market", ...location.queryInput }, { enabled: channel === "nearby" });
  const products = trpc.productModels.publicList.useQuery({ limit: 30 }, { enabled: channel === "products" });
  const ideas = trpc.ideas.listPublic.useQuery({ limit: 20 }, { enabled: channel === "ideas" && isAuthenticated });
  const ideaRows = useMemo(() => asIdeaListItems(ideas.data ?? []), [ideas.data]);

  const skeleton = ["following", "experience", "videos", "questions"].includes(channel);

  return (
    <ScreenContainer>
      <View className="flex-1">
        <View className="px-4 pb-3 pt-3">
          <Text className="text-2xl font-bold text-foreground">发现</Text>
          <Text className="mt-1 text-sm text-muted">唯一内容发现入口，业务与内容卡片在频道内统一呈现。</Text>
          {channel === "nearby" ? (
            <Text className="mt-2 text-xs text-primary">当前城市：{location.region ?? "未选择"} · 附近 · 默认服务范围</Text>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {DISCOVER_CHANNELS.map((item) => (
            <Pressable key={item.id} onPress={() => setChannel(item.id)} className={`mx-1 rounded-full px-4 py-2 ${channel === item.id ? "bg-primary" : "border border-border bg-surface"}`}>
              <Text className={channel === item.id ? "font-medium text-white" : "text-foreground"}>{item.title}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {skeleton ? (
          <EmptyState
            title={`${DISCOVER_CHANNELS.find((item) => item.id === channel)?.title}频道建设中`}
            hint="频道路由与状态已经接通，内容服务上线后会复用同一信息流。"
            actionTitle="去发布"
            onAction={() => router.push("/(tabs)/publish" as never)}
          />
        ) : channel === "ideas" && !isAuthenticated ? (
          <EmptyState title="登录后发现创意" hint="登录后服务端会按授权规则返回可见字段。" actionTitle="登录" onAction={startLogin} />
        ) : channel === "ideas" ? (
          ideas.isLoading ? <LoadingView /> : ideas.isError ? <ErrorState hint={ideas.error.message} onRetry={() => ideas.refetch()} /> : (
            <FlatList data={ideaRows} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <IdeaCard idea={item} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} ListEmptyComponent={<EmptyState title="暂无公开创意" hint="成为第一个发起公开创意的人。" actionTitle="发布创意" onAction={() => router.push("/ideas/edit" as never)} />} />
          )
        ) : channel === "products" ? (
          products.isLoading ? <LoadingView /> : products.isError ? <ErrorState hint={products.error.message} onRetry={() => products.refetch()} /> : (
            <FlatList
              data={products.data?.items ?? []}
              keyExtractor={(item) => item.publicCode}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
              ListEmptyComponent={<EmptyState title="暂无可信产品" hint="通过发布门禁的产品会显示在这里。" />}
              renderItem={({ item }) => (
                <Pressable onPress={() => router.push(`/products/${item.publicCode}` as never)} className="mb-3 rounded-2xl border border-border bg-surface p-4">
                  <View className="flex-row items-center justify-between"><StatusBadge label="已发布" tone="green" /><Text className="text-xs text-muted">{item.publicCode}</Text></View>
                  <Text className="mt-3 text-lg font-bold text-foreground">{item.name}</Text>
                  <Text className="mt-1 text-sm text-muted" numberOfLines={2}>{item.summary}</Text>
                  <View className="mt-2"><SourceLabel>产品身份系统</SourceLabel></View>
                </Pressable>
              )}
            />
          )
        ) : channel === "nearby" ? (
          nearby.isLoading ? <LoadingView /> : nearby.isError ? <ErrorState hint={nearby.error.message} onRetry={() => nearby.refetch()} /> : (
            <FlatList data={nearby.data ?? []} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <ListingCard listing={item} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={nearby.isRefetching} onRefresh={() => nearby.refetch()} />} ListEmptyComponent={<EmptyState title="附近暂无内容" hint="切换首页位置或扩大服务范围后再试。" actionTitle="切换城市" onAction={() => router.push("/location" as never)} />} />
          )
        ) : (
          feed.isLoading ? <LoadingView /> : feed.isError ? <ErrorState hint={feed.error.message} onRetry={() => feed.refetch()} /> : (
            <FlatList data={feed.data?.needs ?? []} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <NeedCard need={item} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} />} ListEmptyComponent={<EmptyState title="暂无推荐内容" hint="平台会根据你的当前城市与关注逐步丰富推荐。" actionTitle="发布需求" onAction={() => router.push("/(tabs)/publish" as never)} />} />
          )
        )}
      </View>
    </ScreenContainer>
  );
}
