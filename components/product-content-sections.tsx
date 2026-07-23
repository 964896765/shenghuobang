import { Text, View } from "react-native";

import { type ContentCardData, ContentCard } from "@/components/content-card";
import { EmptyState, ErrorState, LoadingView } from "@/components/common";

const sections = [
  { id: "official", title: "官方内容", match: (item: ContentCardData) => item.post.sourceType === "organization_official" },
  { id: "reviews", title: "用户测评", match: (item: ContentCardData) => item.post.contentType === "product_review" && item.post.sourceType !== "organization_official" },
  { id: "tutorials", title: "使用教程", match: (item: ContentCardData) => item.post.contentType === "tutorial" },
  { id: "repairs", title: "维修案例", match: (item: ContentCardData) => item.post.contentType === "repair_case" },
] as const;

export function ProductContentSections({ data, loading, error, onRetry }: { data?: ContentCardData[]; loading: boolean; error?: string; onRetry: () => void }) {
  if (loading) return <LoadingView text="正在加载产品相关内容…" />;
  if (error) return <ErrorState title="产品内容加载失败" hint={error} onRetry={onRetry} />;
  const rows = data ?? [];
  return (
    <View className="mt-6">
      <Text className="text-xl font-bold text-foreground">产品相关内容</Text>
      <Text className="mt-1 text-sm leading-6 text-muted">以下是内容作品，不会写入或修改产品事实与护照事件。</Text>
      {sections.map((section) => {
        const items = rows.filter(section.match);
        return (
          <View key={section.id} className="mt-5">
            <Text className="mb-3 text-lg font-bold text-foreground">{section.title}</Text>
            {items.length ? items.map((item) => <ContentCard key={item.post.id} item={item} />) : <View className="rounded-xl border border-dashed border-border px-4 py-5"><Text className="text-center text-sm text-muted">暂无{section.title}</Text></View>}
          </View>
        );
      })}
      {!rows.length ? <EmptyState title="暂无产品相关内容" hint="关联该产品发布的官方内容、测评、教程和维修案例会显示在这里。" /> : null}
    </View>
  );
}
