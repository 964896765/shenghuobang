import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { IdeaCard } from "@/components/idea-card";
import { ScreenContainer } from "@/components/screen-container";
import { asIdeaListItems, ideaErrorMessage, mergeIdeaPages, type IdeaListItem } from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

function PublicIdeas() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const query = trpc.ideas.listPublic.useQuery({ limit: 20 });
  const [additional, setAdditional] = useState<IdeaListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const firstPage = asIdeaListItems(query.data ?? []);
  const rows = useMemo(() => mergeIdeaPages(firstPage, additional), [firstPage, additional]);

  const refresh = async () => {
    setAdditional([]);
    setLoadMoreError("");
    await query.refetch();
  };

  const loadMore = async () => {
    const last = rows.at(-1);
    if (!last?.publishedAt || loadingMore || firstPage.length === 0) return;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const page = await utils.client.ideas.listPublic.query({
        limit: 20,
        cursor: { publishedAt: new Date(last.publishedAt).toISOString(), id: last.id },
      });
      setAdditional((current) => mergeIdeaPages(current, asIdeaListItems(page)));
    } catch (error) {
      setLoadMoreError(ideaErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  if (query.isLoading) return <LoadingView text="正在发现创意…" />;
  if (query.isError && rows.length === 0) return <ErrorState title="暂时无法加载创意" hint={ideaErrorMessage(query.error)} onRetry={refresh} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <IdeaCard idea={item} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, flexGrow: rows.length ? undefined : 1 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} />}
      ListHeaderComponent={(
        <View className="mb-3">
          <Text className="text-2xl font-bold text-foreground">创意发现</Text>
          <Text className="text-sm text-muted mt-1">发现公开想法，邀请合适伙伴一起把它变成项目。</Text>
          <View className="flex-row gap-2 mt-3">
            <View className="flex-1"><PrimaryButton title="发布创意" onPress={() => router.push("/ideas/edit" as never)} /></View>
            <View className="flex-1"><PrimaryButton title="我的创意" variant="outline" onPress={() => router.push("/ideas/mine" as never)} /></View>
          </View>
        </View>
      )}
      ListEmptyComponent={<EmptyState title="暂无公开创意" hint="成为第一个发布创意的人。" actionTitle="创建创意" onAction={() => router.push("/ideas/edit" as never)} />}
      ListFooterComponent={rows.length ? (
        <View className="py-3">
          {loadMoreError ? <Text className="text-sm text-error text-center mb-2">{loadMoreError}</Text> : null}
          <PrimaryButton title={loadingMore ? "加载中…" : "加载更多"} variant="outline" loading={loadingMore} onPress={loadMore} disabled={firstPage.length < 20 && additional.length === 0} />
        </View>
      ) : null}
      onEndReachedThreshold={0.3}
    />
  );
}

export default function IdeasDiscoverScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="创意" /><AuthGate title="登录后发现和发布创意"><PublicIdeas /></AuthGate></ScreenContainer>;
}
