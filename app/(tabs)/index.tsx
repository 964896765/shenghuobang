import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { NeedCard, EngineerCard, ListingCard } from "@/components/cards";
import { SectionHeader, EmptyState, ErrorState, StatusBadge, LoadingView } from "@/components/common";
import { PROJECT_STATUS, RECYCLING_STATUS, formatTime } from "@/lib/labels";
import { startLogin } from "@/constants/app";

const QUICK_ENTRIES = [
  { icon: "doc.text.fill", label: "发布需求", route: "/needs/create", color: "#16A34A" },
  { icon: "wrench.fill", label: "找工程师", route: "/engineers", color: "#0D9488" },
  { icon: "tag.fill", label: "旧物出售", route: "/listings/create", color: "#F97316" },
  { icon: "arrow.3.trianglepath", label: "物品回收", route: "/recycling/create", color: "#2563EB" },
  { icon: "gift.fill", label: "免费赠送", route: "/listings/create?mode=giveaway", color: "#DB2777" },
  { icon: "square.grid.2x2.fill", label: "全部服务", route: "/publish-center", color: "#7C3AED" },
] as const;

const QUICK_QUESTIONS = ["空调不制冷了", "想开发一个小程序", "旧洗衣机想处理", "家里想装智能灯"];

function UserHome() {
  const router = useRouter();
  const colors = useColors();
  const { isAuthenticated, profile } = useRole();
  const feed = trpc.home.feed.useQuery();

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} />}
    >
      {/* 顶部 */}
      <View className="flex-row items-center px-4 pt-2 pb-3">
        <View className="flex-row items-center">
          <IconSymbol name="mappin.circle.fill" size={18} color={colors.primary} />
          <Text className="text-sm font-medium text-foreground ml-1">{profile?.cityName ?? "北京"}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/search" as any)}
          style={({ pressed }) => [styles.searchBar, { opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="magnifyingglass" size={16} color="#9CA3AF" />
          <Text className="text-sm text-muted ml-2">搜问题、工程师、服务或物品</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/notifications" as any)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
        >
          <IconSymbol name="bell.fill" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* AI 生活助手 */}
      <View className="mx-4 rounded-2xl bg-primary p-5">
        <View className="flex-row items-center mb-1.5">
          <IconSymbol name="sparkles" size={20} color="#fff" />
          <Text className="text-lg font-bold text-white ml-2">AI 生活助手</Text>
        </View>
        <Text className="text-sm text-white/90 leading-5 mb-4">
          遇到了什么问题?说出来,AI 帮你整理成清晰的需求,找到真正能解决的人。
        </Text>
        <Pressable
          onPress={() => (isAuthenticated ? router.push("/needs/create" as any) : startLogin())}
          style={({ pressed }) => [styles.aiInput, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text className="text-sm text-muted flex-1">请描述你遇到的问题或想实现的效果…</Text>
          <View style={styles.aiSend}>
            <IconSymbol name="arrow.right" size={16} color="#fff" />
          </View>
        </Pressable>
        <View className="flex-row flex-wrap gap-2 mt-3">
          {QUICK_QUESTIONS.map((q) => (
            <Pressable
              key={q}
              onPress={() =>
                isAuthenticated
                  ? router.push({ pathname: "/needs/create", params: { preset: q } } as any)
                  : startLogin()
              }
              style={({ pressed }) => [styles.quickChip, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text className="text-xs text-white">{q}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 快捷入口 */}
      <View className="flex-row flex-wrap px-4 mt-4">
        {QUICK_ENTRIES.map((e) => (
          <Pressable
            key={e.label}
            onPress={() => router.push(e.route as any)}
            style={({ pressed }) => [styles.entry, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.entryIcon, { backgroundColor: `${e.color}18` }]}>
              <IconSymbol name={e.icon as any} size={22} color={e.color} />
            </View>
            <Text className="text-xs text-foreground mt-1.5">{e.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* 附近需求 */}
      <View className="px-4 mt-4">
        <SectionHeader title="附近的需求" actionTitle="更多" onAction={() => router.push("/discover?tab=needs" as any)} />
        {feed.isLoading ? (
          <LoadingView />
        ) : feed.isError ? (
          <ErrorState title="首页加载失败" hint={feed.error.message} onRetry={() => feed.refetch()} />
        ) : (feed.data?.needs ?? []).length === 0 ? (
          <EmptyState
            title="当前区域服务较少"
            hint="可以发布需求,平台会帮助寻找合适的人。"
            actionTitle="发布需求"
            onAction={() => router.push("/needs/create" as any)}
          />
        ) : (
          (feed.data?.needs ?? []).map((n) => <NeedCard key={n.id} need={n} />)
        )}
      </View>

      {/* 推荐工程师 */}
      <View className="px-4 mt-2">
        <SectionHeader title="推荐工程师" actionTitle="更多" onAction={() => router.push("/engineers" as any)} />
        {(feed.data?.engineers ?? []).slice(0, 3).map((e) => (
          <EngineerCard key={e.userId} engineer={e} />
        ))}
      </View>

      {/* 附近旧物 */}
      <View className="px-4 mt-2">
        <SectionHeader title="附近的旧物" actionTitle="更多" onAction={() => router.push("/discover?tab=listings" as any)} />
        {(feed.data?.listings ?? []).slice(0, 4).map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </View>
    </ScrollView>
  );
}

function EngineerHome() {
  const router = useRouter();
  const { profile } = useRole();
  const needsQuery = trpc.needs.list.useQuery({ scope: "plaza" });
  const myQuotes = trpc.quotes.myQuotes.useQuery();
  const projects = trpc.projects.list.useQuery();

  const activeProjects = (projects.data ?? []).filter((p) =>
    ["pending_confirmation", "pending_agreement", "pending_payment", "in_progress", "waiting_acceptance", "revision"].includes(p.status),
  );
  const pendingQuotes = (myQuotes.data?.quotes ?? []).filter((q) => ["submitted", "viewed", "negotiating"].includes(q.status));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-3 pb-1">
        <Text className="text-2xl font-bold text-foreground">工程师工作台</Text>
        <Text className="text-sm text-muted mt-1">{profile?.nickname ?? ""},今天也要接单顺利</Text>
      </View>

      <View className="flex-row px-4 mt-3 gap-3">
        <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center">
          <Text className="text-2xl font-bold text-primary">{activeProjects.length}</Text>
          <Text className="text-xs text-muted mt-1">进行中项目</Text>
        </View>
        <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center">
          <Text className="text-2xl font-bold text-accent">{pendingQuotes.length}</Text>
          <Text className="text-xs text-muted mt-1">待响应报价</Text>
        </View>
        <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center">
          <Text className="text-2xl font-bold text-action">{(needsQuery.data ?? []).length}</Text>
          <Text className="text-xs text-muted mt-1">大厅新需求</Text>
        </View>
      </View>

      <View className="px-4 mt-4">
        <SectionHeader title="进行中的项目" actionTitle="全部" onAction={() => router.push("/projects" as any)} />
        {activeProjects.length === 0 ? (
          <EmptyState title="暂无进行中的项目" hint="去需求大厅看看有没有适合你的需求吧。" actionTitle="去需求大厅" onAction={() => router.push("/discover" as any)} />
        ) : (
          activeProjects.slice(0, 3).map((p) => {
            const st = PROJECT_STATUS[p.status] ?? { label: p.status, tone: "gray" as const };
            return (
              <Pressable key={p.id} onPress={() => router.push(`/projects/${p.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <StatusBadge label={st.label} tone={st.tone} small />
                    <Text className="text-xs text-muted">{formatTime(p.createdAt)}</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{p.title}</Text>
                  <Text className="text-sm text-action font-semibold mt-1">¥{p.totalAmount}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <View className="px-4 mt-2">
        <SectionHeader title="最新需求" actionTitle="需求大厅" onAction={() => router.push("/discover" as any)} />
        {(needsQuery.data ?? []).slice(0, 5).map((n) => (
          <NeedCard key={n.id} need={n} />
        ))}
      </View>
    </ScrollView>
  );
}

function MerchantHome() {
  const router = useRouter();
  const { profile } = useRole();
  const openRequests = trpc.recycling.openRequests.useQuery();
  const orders = trpc.orders.list.useQuery();

  const activeOrders = (orders.data ?? []).filter((o) =>
    ["pending_confirmation", "pending_payment", "paid", "pending_delivery", "pending_acceptance"].includes(o.status),
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View className="px-4 pt-3 pb-1">
        <Text className="text-2xl font-bold text-foreground">商家工作台</Text>
        <Text className="text-sm text-muted mt-1">{profile?.nickname ?? ""},附近有新的回收询价</Text>
      </View>

      <View className="flex-row px-4 mt-3 gap-3">
        <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center">
          <Text className="text-2xl font-bold text-primary">{(openRequests.data ?? []).length}</Text>
          <Text className="text-xs text-muted mt-1">待报价询价</Text>
        </View>
        <View className="flex-1 bg-surface rounded-2xl p-4 border border-border items-center">
          <Text className="text-2xl font-bold text-action">{activeOrders.length}</Text>
          <Text className="text-xs text-muted mt-1">进行中订单</Text>
        </View>
      </View>

      <View className="px-4 mt-4">
        <SectionHeader title="附近的回收询价" actionTitle="全部" onAction={() => router.push("/discover" as any)} />
        {(openRequests.data ?? []).length === 0 ? (
          <EmptyState title="暂无待报价的询价" hint="有用户发布回收询价时会显示在这里。" />
        ) : (
          (openRequests.data ?? []).slice(0, 5).map((r) => {
            const st = RECYCLING_STATUS[r.status] ?? { label: r.status, tone: "gray" as const };
            return (
              <Pressable key={r.id} onPress={() => router.push(`/recycling/${r.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <StatusBadge label={st.label} tone={st.tone} small />
                    <Text className="text-xs text-muted">{formatTime(r.createdAt)}</Text>
                  </View>
                  <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{r.title}</Text>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-xs text-muted">{r.category}</Text>
                    {r.expectedPrice ? <Text className="text-xs text-action">期望 ¥{r.expectedPrice}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { role, isAuthenticated } = useRole();
  return (
    <ScreenContainer>
      {role === "engineer" && isAuthenticated ? <EngineerHome /> : role === "merchant" && isAuthenticated ? <MerchantHome /> : <UserHome />}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E5E9E6",
  },
  aiInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  aiSend: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  quickChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  entry: {
    width: "33.33%",
    alignItems: "center",
    paddingVertical: 10,
  },
  entryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
