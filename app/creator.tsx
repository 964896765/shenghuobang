import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { contentTypeLabel, newContentRequestId } from "@/shared/content";

const views = [
  { id: "works", title: "作品" }, { id: "drafts", title: "草稿" },
  { id: "comments", title: "评论" }, { id: "favorites", title: "收藏" },
  { id: "following", title: "关注" }, { id: "followers", title: "粉丝" },
  { id: "analytics", title: "数据" },
] as const;
type ViewId = typeof views[number]["id"];

function validView(value?: string): ViewId {
  return views.some((view) => view.id === value) ? value as ViewId : "works";
}

function CreatorCenter() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ViewId>(() => validView(params.view));
  const utils = trpc.useUtils();
  useEffect(() => setView(validView(params.view)), [params.view]);
  const mine = trpc.content.mine.useQuery({ limit: 50 }, { enabled: view === "works" || view === "drafts" });
  const dashboard = trpc.content.creatorDashboard.useQuery(undefined, { enabled: view === "analytics" });
  const comments = trpc.content.myComments.useQuery({ limit: 50 }, { enabled: view === "comments" });
  const favorites = trpc.content.myFavorites.useQuery({ limit: 50 }, { enabled: view === "favorites" });
  const follows = trpc.content.myFollows.useQuery({ direction: view === "followers" ? "followers" : "following", limit: 50 }, { enabled: view === "following" || view === "followers" });
  const deleteComment = trpc.content.deleteComment.useMutation();

  const rows = useMemo(() => (mine.data ?? []).filter((item) => view === "works" ? ["published", "recommendation_limited"].includes(item.post.status) : !["published", "author_deleted", "platform_banned"].includes(item.post.status)), [mine.data, view]);
  const loading = (view === "works" || view === "drafts") ? mine.isLoading : view === "comments" ? comments.isLoading : view === "favorites" ? favorites.isLoading : (view === "following" || view === "followers") ? follows.isLoading : dashboard.isLoading;
  const error = (view === "works" || view === "drafts") ? mine.error : view === "comments" ? comments.error : view === "favorites" ? favorites.error : (view === "following" || view === "followers") ? follows.error : dashboard.error;

  const removeComment = async (commentId: number) => {
    await deleteComment.mutateAsync({ commentId, requestId: newContentRequestId("delete-comment") });
    await Promise.all([comments.refetch(), utils.content.creatorDashboard.invalidate()]);
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="创作者中心" right={<Pressable onPress={() => router.push("/content/create?type=post" as never)}><Text className="font-semibold text-primary">创作</Text></Pressable>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }} style={{ flexGrow: 0 }}>
        {views.map((item) => (
          <Pressable key={item.id} onPress={() => setView(item.id)} className={`mx-1 rounded-full px-4 py-2 ${view === item.id ? "bg-primary" : "border border-border bg-surface"}`}>
            <Text className={view === item.id ? "font-medium text-white" : "text-foreground"}>{item.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? <LoadingView text="正在加载创作数据…" /> : error ? <ErrorState hint={error.message} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {(view === "works" || view === "drafts") ? (
            rows.length ? rows.map(({ post, metrics }) => (
              <Pressable key={post.id} onPress={() => router.push(`/content/${post.id}${post.status === "published" ? "" : "?preview=1"}` as never)} className="mb-3 rounded-2xl border border-border bg-surface p-4">
                <View className="flex-row items-center justify-between gap-2"><StatusBadge label={post.status} tone={post.status === "published" ? "green" : "orange"} /><Text className="text-xs text-muted">{contentTypeLabel(post.contentType)}</Text></View>
                <Text className="mt-3 text-lg font-bold text-foreground">{post.title}</Text>
                <Text className="mt-1 text-sm text-muted" numberOfLines={2}>{post.summary || post.body}</Text>
                <Text className="mt-2 text-xs text-muted">浏览 {metrics?.viewCount ?? 0} · 赞 {metrics?.likeCount ?? 0} · 收藏 {metrics?.favoriteCount ?? 0} · 评论 {metrics?.commentCount ?? 0}</Text>
              </Pressable>
            )) : <EmptyState title={view === "works" ? "还没有已发布作品" : "还没有草稿"} actionTitle="开始创作" onAction={() => router.push("/content/create?type=post" as never)} />
          ) : view === "comments" ? (
            comments.data?.length ? comments.data.map((item) => (
              <View key={item.id} className="mb-3 rounded-2xl border border-border bg-surface p-4">
                <Pressable onPress={() => router.push(`/content/${item.postId}` as never)}><Text className="font-bold text-foreground">{item.postTitle}</Text></Pressable>
                <Text className="mt-2 text-sm text-muted">{item.status === "author_deleted" ? "该评论已删除" : item.body}</Text>
                {item.status === "published" ? <View className="mt-3"><PrimaryButton title="删除本人评论" onPress={() => void removeComment(item.id)} small variant="danger" /></View> : null}
              </View>
            )) : <EmptyState title="还没有评论记录" hint="你在内容详情中发表的评论会显示在这里。" />
          ) : view === "favorites" ? (
            favorites.data?.length ? favorites.data.map((item) => (
              <Pressable key={item.id} onPress={() => router.push(`/content/${item.id}` as never)} className="mb-3 rounded-2xl border border-border bg-surface p-4">
                <Text className="text-xs text-muted">{contentTypeLabel(item.contentType)} · {item.authorName || "生活帮用户"}</Text>
                <Text className="mt-2 text-base font-bold text-foreground">{item.title}</Text>
              </Pressable>
            )) : <EmptyState title="还没有收藏内容" hint="在内容详情点击收藏后会出现在这里。" actionTitle="去发现" onAction={() => router.push("/(tabs)/discover" as never)} />
          ) : (view === "following" || view === "followers") ? (
            follows.data?.length ? follows.data.map((item) => (
              <View key={item.accountId} className="mb-3 flex-row items-center rounded-2xl border border-border bg-surface p-4">
                <View className="flex-1"><Text className="font-bold text-foreground">{item.name || `用户 ${item.accountId}`}</Text><Text className="mt-1 text-xs text-muted">{item.verificationLabel || "未展示认证"}</Text></View>
                <StatusBadge label={view === "following" ? "已关注" : "粉丝"} tone="blue" />
              </View>
            )) : <EmptyState title={view === "following" ? "还没有关注创作者" : "还没有粉丝"} hint={view === "following" ? "可在内容详情关注作者。" : "持续发布有价值的真实内容。"} />
          ) : (
            <View>
              <Text className="text-lg font-bold text-foreground">创作数据</Text>
              <Text className="mt-1 text-sm text-muted">数据来自内容互动明细聚合；订单转化仅预留指标，不虚构结果。</Text>
              <View className="mt-4 flex-row flex-wrap gap-3">
                {[
                  ["作品", dashboard.data?.profile?.publishedCount ?? 0], ["草稿", dashboard.data?.draftCount ?? 0],
                  ["浏览", dashboard.data?.profile?.totalViewCount ?? 0], ["点赞", dashboard.data?.profile?.totalLikeCount ?? 0],
                  ["收藏", dashboard.data?.profile?.totalFavoriteCount ?? 0], ["评论", dashboard.data?.profile?.totalCommentCount ?? 0],
                  ["产品点击", dashboard.data?.profile?.productClickCount ?? 0], ["创意点击", dashboard.data?.profile?.ideaClickCount ?? 0],
                  ["商品点击", dashboard.data?.profile?.listingClickCount ?? 0],
                ].map(([label, value]) => <View key={String(label)} className="w-[30%] min-w-24 rounded-2xl border border-border bg-surface p-3"><Text className="text-2xl font-bold text-foreground">{value}</Text><Text className="mt-1 text-xs text-muted">{label}</Text></View>)}
              </View>
              <View className="mt-4 rounded-xl bg-orange-50 p-3"><Text className="text-sm text-orange-700">订单转化：待商城闭环产生可归因事件后计算</Text></View>
            </View>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

export default function CreatorCenterScreen() {
  return <AuthGate title="登录后进入创作者中心"><CreatorCenter /></AuthGate>;
}
