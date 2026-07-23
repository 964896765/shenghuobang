import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { IdeaCard } from "@/components/idea-card";
import { ScreenContainer } from "@/components/screen-container";
import { IDEA_STATUS_LABELS, asIdeaListItems, ideaErrorMessage, type IdeaStatus } from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

const filters: { value: "all" | IdeaStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "collaborating", label: "协作中" },
  { value: "converted", label: "已转项目" },
  { value: "archived", label: "已归档" },
];

function Mine() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | IdeaStatus>("all");
  const query = trpc.ideas.listMine.useQuery({ limit: 50 });
  const rows = useMemo(() => asIdeaListItems(query.data ?? []).filter((item) => filter === "all" || item.status === filter), [filter, query.data]);
  if (query.isLoading) return <LoadingView text="正在加载我的创意…" />;
  if (query.isError) return <ErrorState title="无法加载我的创意" hint={ideaErrorMessage(query.error)} onRetry={() => query.refetch()} />;
  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <IdeaCard idea={item} />}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 }}
      ListHeaderComponent={(
        <View className="mb-3">
          <View className="flex-row gap-2 mb-3">
            <View className="flex-1"><PrimaryButton title="创建创意" onPress={() => router.push("/ideas/edit" as never)} /></View>
            <View className="flex-1"><PrimaryButton title="协作邀请" variant="outline" onPress={() => router.push("/ideas/invitations" as never)} /></View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {filters.map((item) => <Pressable key={item.value} onPress={() => setFilter(item.value)}><Text className={filter === item.value ? "bg-primary text-white px-3 py-2 rounded-full text-sm" : "bg-surface border border-border text-foreground px-3 py-2 rounded-full text-sm"}>{item.label}</Text></Pressable>)}
          </View>
        </View>
      )}
      ListEmptyComponent={<EmptyState title={filter === "all" ? "还没有创意" : `暂无${IDEA_STATUS_LABELS[filter]}`} hint="创建草稿后会显示在这里。" actionTitle="创建创意" onAction={() => router.push("/ideas/edit" as never)} />}
    />
  );
}

export default function MyIdeasScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="我的创意" /><AuthGate title="登录后管理创意"><Mine /></AuthGate></ScreenContainer>;
}
