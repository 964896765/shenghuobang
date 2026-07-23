import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { type ContentCardData, ContentCard } from "@/components/content-card";
import { EmptyState, ErrorState, LoadingView } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { startLogin } from "@/constants/app";
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

  const content = trpc.content.discover.useQuery({
    channel,
    limit: 30,
    locationLabel: channel === "nearby" ? location.region ?? undefined : undefined,
  });

  const label = DISCOVER_CHANNELS.find((item) => item.id === channel)?.title ?? "发现";

  return (
    <ScreenContainer>
      <View className="flex-1">
        <View className="px-4 pb-3 pt-3">
          <Text className="text-2xl font-bold text-foreground">发现</Text>
          <Text className="mt-1 text-sm text-muted">八个频道共用同一可信内容流，来源、作者认证和业务关联分别展示。</Text>
          {channel === "nearby" ? <Text className="mt-2 text-xs text-primary">当前城市：{location.region ?? "未选择"} · 附近内容使用全局位置状态</Text> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {DISCOVER_CHANNELS.map((item) => (
            <Pressable key={item.id} onPress={() => setChannel(item.id)} className={`mx-1 rounded-full px-4 py-2 ${channel === item.id ? "bg-primary" : "border border-border bg-surface"}`}>
              <Text className={channel === item.id ? "font-medium text-white" : "text-foreground"}>{item.title}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {channel === "following" && !isAuthenticated ? (
          <EmptyState title="登录后查看关注内容" hint="关注频道只展示你已关注作者发布的公开内容。" actionTitle="登录" onAction={startLogin} />
        ) : content.isLoading ? <LoadingView text={`正在加载${label}频道…`} />
          : content.isError ? <ErrorState title={`${label}频道加载失败`} hint={content.error.message} onRetry={() => content.refetch()} />
            : (
              <FlatList
                data={(content.data ?? []) as ContentCardData[]}
                keyExtractor={(item) => String(item.post.id)}
                renderItem={({ item }) => <ContentCard item={item} />}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
                refreshControl={<RefreshControl refreshing={content.isRefetching} onRefresh={() => content.refetch()} />}
                ListEmptyComponent={
                  <EmptyState
                    title={`${label}频道暂无内容`}
                    hint={channel === "nearby" ? "可到首页切换城市，或发布带模糊位置的内容。" : "发布第一篇真实、有来源声明的内容。"}
                    actionTitle={channel === "nearby" ? "切换城市" : "去创作"}
                    onAction={() => router.push((channel === "nearby" ? "/location" : "/(tabs)/publish") as never)}
                  />
                }
              />
            )}
      </View>
    </ScreenContainer>
  );
}
