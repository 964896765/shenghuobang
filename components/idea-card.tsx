import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBadge } from "@/components/common";
import {
  IDEA_STATUS_LABELS,
  IDEA_VISIBILITY_LABELS,
  type IdeaListItem,
  type IdeaStatus,
  type IdeaVisibility,
} from "@/lib/idea-app";

function toneForVisibility(visibility: IdeaVisibility) {
  return visibility === "public" ? "green" as const : visibility === "nda" ? "orange" as const : "blue" as const;
}

export function IdeaCard({ idea }: { idea: IdeaListItem }) {
  const router = useRouter();
  const visibility = idea.visibility ?? "private";
  const status = idea.status ?? "draft";
  return (
    <Pressable onPress={() => router.push(`/ideas/${idea.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
      <View className="bg-surface rounded-2xl border border-border p-4 mb-3">
        <View className="flex-row items-center gap-2 mb-2">
          <StatusBadge label={IDEA_VISIBILITY_LABELS[visibility as IdeaVisibility]} tone={toneForVisibility(visibility as IdeaVisibility)} small />
          <StatusBadge label={IDEA_STATUS_LABELS[status as IdeaStatus]} tone={status === "archived" ? "gray" : status === "converted" ? "teal" : "blue"} small />
          {idea.categoryCode ? <Text className="text-xs text-muted ml-auto">{idea.categoryCode}</Text> : null}
        </View>
        <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>{idea.title || "未命名创意"}</Text>
        {idea.summary ? <Text className="text-sm text-muted mt-1.5 leading-5" numberOfLines={3}>{idea.summary}</Text> : null}
        {idea.tags?.length ? (
          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {idea.tags.slice(0, 6).map((tag) => <Text key={tag} className="text-xs text-primary bg-primary/10 rounded-full px-2 py-1">#{tag}</Text>)}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
