import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, LoadingView, StatusBadge } from "@/components/common";
import { PROJECT_STATUS, formatTime } from "@/lib/labels";

function ProjectsInner() {
  const router = useRouter();
  const projects = trpc.projects.list.useQuery();

  if (projects.isLoading) return <LoadingView />;

  return (
    <FlatList
      data={projects.data ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
      ListEmptyComponent={<EmptyState title="暂无项目" hint="接受报价后会自动建立项目,在这里跟踪进度。" />}
      renderItem={({ item }) => {
        const st = PROJECT_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
        return (
          <Pressable onPress={() => router.push(`/projects/${item.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
              <View className="flex-row items-center justify-between mb-1.5">
                <StatusBadge label={st.label} tone={st.tone} small />
                <Text className="text-xs text-muted">{formatTime(item.createdAt)}</Text>
              </View>
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {item.title}
              </Text>
              <View className="flex-row items-center justify-between mt-1.5">
                <Text className="text-sm text-action font-semibold">¥{item.totalAmount}</Text>
                <Text className="text-xs text-muted">{item.myRole === "owner" ? "我是需求方" : "我是工程师"}</Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export default function ProjectsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的项目" />
      <AuthGate title="登录后查看项目">
        <ProjectsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
