import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, LoadingView, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { formatTime } from "@/lib/labels";

export default function ComplaintsListScreen() {
  const router = useRouter();
  const list = trpc.complaints.list.useQuery();
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="投诉与争议" /><AuthGate title="登录后查看投诉">{list.isLoading ? <LoadingView /> : <FlatList contentContainerStyle={{ padding: 16, paddingBottom: 36 }} data={list.data ?? []} keyExtractor={(i) => String(i.id)} ListEmptyComponent={<EmptyState title="暂无投诉记录" hint="项目出现交付、延期、需求范围或验收争议时，可以从项目详情发起投诉。" />} renderItem={({ item }) => <Pressable onPress={() => router.push(`/complaints/${item.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}><View className="bg-surface rounded-2xl border border-border p-4 mb-3"><View className="flex-row items-center justify-between"><Text className="text-sm font-bold text-foreground">{item.complaintType}</Text><StatusBadge label={item.status} tone={item.status === "resolved" ? "green" : item.status === "rejected" ? "red" : "orange"} small /></View><Text className="text-sm text-foreground mt-2" numberOfLines={2}>{item.description}</Text><Text className="text-xs text-muted mt-2">{item.relatedType} #{item.relatedId} · {formatTime(item.createdAt)}</Text></View></Pressable>} />}</AuthGate></ScreenContainer>;
}
