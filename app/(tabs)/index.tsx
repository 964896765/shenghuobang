import { useEffect } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAppEntryNavigation } from "@/components/app-entry-navigation";
import { NeedCard, EngineerCard, ListingCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, SectionHeader } from "@/components/common";
import { EntryGrid, GlobalHeader } from "@/components/global-navigation";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { markBootPhase } from "@/lib/boot-diagnostics";
import { useGlobalLocation } from "@/lib/location-context";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { HOME_ENTRIES } from "@/shared/navigation/homeEntries";

export default function HomeScreen() {
  const router = useRouter();
  useEffect(() => {
    markBootPhase("home rendered");
  }, []);
  const navigate = useAppEntryNavigation();
  const location = useGlobalLocation();
  const { role, isAuthenticated, profile } = useRole();
  const feed = trpc.home.feed.useQuery(location.queryInput);
  const workspaceTitle = role === "engineer" ? "设计师/工程师工作台" : role === "merchant" ? "企业与服务工作台" : "个人工作台";

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} />}
      >
        <GlobalHeader />

        <Pressable onPress={() => router.push("/search" as never)} className="mx-4 rounded-2xl bg-primary p-5">
          <View className="flex-row items-center">
            <IconSymbol name="sparkles" size={21} color="#FFFFFF" />
            <Text className="ml-2 text-lg font-bold text-white">AI 生活助手</Text>
          </View>
          <Text className="mt-2 text-sm leading-5 text-white/90">描述问题、想法或产品，统一搜索与 AI 会引导你进入真实业务流程。</Text>
        </Pressable>

        <View className="mt-3">
          <EntryGrid entries={HOME_ENTRIES} onPress={navigate} />
        </View>

        {isAuthenticated ? (
          <Pressable onPress={() => router.push("/workspaces" as never)} className="mx-4 mb-4 flex-row items-center rounded-2xl border border-border bg-surface p-4">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-action/10">
              <IconSymbol name="briefcase.fill" size={23} color="#F97316" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-foreground">{workspaceTitle}</Text>
              <Text className="mt-0.5 text-xs text-muted">{profile?.nickname ?? "当前身份"} · 切换身份与组织上下文</Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
          </Pressable>
        ) : null}

        <View className="px-4">
          <SectionHeader title="当前城市与附近服务" actionTitle="发现更多" onAction={() => router.push("/(tabs)/discover?tab=nearby" as never)} />
          <Text className="-mt-2 mb-3 text-xs text-muted">{location.region ?? "尚未选择城市"} · 附近内容复用首页全局位置，不单独申请定位</Text>
          {feed.isLoading ? <LoadingView text="正在加载推荐内容…" /> : feed.isError ? (
            <ErrorState title="首页加载失败" hint={feed.error.message} onRetry={() => feed.refetch()} />
          ) : (feed.data?.needs ?? []).length === 0 ? (
            <EmptyState title="当前城市暂无推荐" hint="可切换城市，或发布一条真实需求。" actionTitle="发布需求" onAction={() => router.push("/needs/create" as never)} />
          ) : (
            (feed.data?.needs ?? []).slice(0, 3).map((item) => <NeedCard key={item.id} need={item} />)
          )}
        </View>

        {(feed.data?.engineers ?? []).length > 0 ? (
          <View className="mt-2 px-4">
            <SectionHeader title="可信服务者" actionTitle="查看全部" onAction={() => router.push("/engineers" as never)} />
            {(feed.data?.engineers ?? []).slice(0, 2).map((item) => <EngineerCard key={item.userId} engineer={item} />)}
          </View>
        ) : null}
        {(feed.data?.listings ?? []).length > 0 ? (
          <View className="mt-2 px-4">
            <SectionHeader title="附近物品" actionTitle="进入发现" onAction={() => router.push("/(tabs)/discover?tab=nearby" as never)} />
            {(feed.data?.listings ?? []).slice(0, 3).map((item) => <ListingCard key={item.id} listing={item} />)}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
