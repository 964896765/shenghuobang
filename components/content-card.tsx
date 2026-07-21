import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { IdentityBadge, SourceLabel } from "@/components/trust-ui";
import { contentMediaUrl } from "@/lib/content-media";
import { contentTypeLabel, RELATION_LABELS, SOURCE_LABELS } from "@/shared/content";

export type ContentCardData = {
  post: {
    id: number;
    contentType: string;
    title: string;
    summary: string | null;
    body: string;
    locationLabel: string | null;
    sourceType: string;
    publishedAt: Date | null;
  };
  metrics: { likeCount: number; favoriteCount: number; commentCount: number; viewCount: number } | null;
  authorName: string | null;
  verificationLabel: string | null;
  media: { fileId: number; mediaType: "image" | "video"; purpose: "cover" | "body" }[];
  relations: { relationType: string; relationId: number; relationLabel: string | null }[];
  tags: { id: number; name: string }[];
  viewer: { liked: boolean; favorited: boolean };
};

export function ContentCard({ item }: { item: ContentCardData }) {
  const router = useRouter();
  const cover = item.media.find((entry) => entry.purpose === "cover") ?? item.media[0];
  return (
    <Pressable onPress={() => router.push(`/content/${item.post.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}>
      <View className="mb-3 overflow-hidden rounded-2xl border border-border bg-surface">
        {cover ? (
          cover.mediaType === "image" ? <Image source={{ uri: contentMediaUrl(cover.fileId) }} className="h-48 w-full" contentFit="cover" />
            : <View className="h-40 items-center justify-center bg-black"><Text className="text-base font-semibold text-white">视频内容 · 点击播放</Text></View>
        ) : null}
        <View className="p-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{item.authorName || "生活帮用户"}</Text>
            {item.verificationLabel ? <IdentityBadge label={item.verificationLabel} /> : null}
            <Text className="text-xs text-muted">{contentTypeLabel(item.post.contentType)}</Text>
          </View>
          <Text className="mt-2 text-lg font-bold text-foreground">{item.post.title}</Text>
          <Text className="mt-1 text-sm leading-6 text-muted" numberOfLines={3}>{item.post.summary || item.post.body}</Text>
          <View className="mt-2"><SourceLabel>{SOURCE_LABELS[item.post.sourceType] ?? item.post.sourceType}</SourceLabel></View>
          {item.post.locationLabel ? <Text className="mt-1 text-xs text-muted">位置：{item.post.locationLabel}</Text> : null}
          {item.relations.length ? (
            <View className="mt-3 rounded-xl bg-primary/10 px-3 py-2">
              <Text className="text-xs font-semibold text-primary">
                关联{RELATION_LABELS[item.relations[0].relationType] ?? "对象"} · {item.relations[0].relationLabel || `#${item.relations[0].relationId}`}
              </Text>
            </View>
          ) : null}
          <View className="mt-3 flex-row gap-4">
            <Text className="text-xs text-muted">浏览 {item.metrics?.viewCount ?? 0}</Text>
            <Text className={item.viewer.liked ? "text-xs text-primary" : "text-xs text-muted"}>赞 {item.metrics?.likeCount ?? 0}</Text>
            <Text className="text-xs text-muted">评论 {item.metrics?.commentCount ?? 0}</Text>
            <Text className={item.viewer.favorited ? "text-xs text-primary" : "text-xs text-muted"}>收藏 {item.metrics?.favoriteCount ?? 0}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
