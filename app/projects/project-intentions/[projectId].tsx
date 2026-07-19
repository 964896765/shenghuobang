import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { Avatar, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import { PROJECT_INTENTION_TYPE_LABELS, projectDesignPrototypeErrorMessage } from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function ProjectIntentionsInner() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawProjectId);
  const router = useRouter();
  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId), retry: 1 });
  const summaryQuery = trpc.projectIntentions.summary.useQuery({ projectId }, { enabled: Number.isFinite(projectId), retry: 1 });
  const listQuery = trpc.projectIntentions.listProject.useQuery({ projectId }, { enabled: Number.isFinite(projectId), retry: 1 });

  if (projectDetail.isLoading || summaryQuery.isLoading || listQuery.isLoading) {
    return <LoadingView text="意向名单加载中..." />;
  }
  if (projectDetail.isError || summaryQuery.isError || listQuery.isError) {
    return (
      <ErrorState
        title="意向名单加载失败"
        hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? summaryQuery.error ?? listQuery.error)}
        onRetry={() => {
          void projectDetail.refetch();
          void summaryQuery.refetch();
          void listQuery.refetch();
        }}
      />
    );
  }
  if (!projectDetail.data || !summaryQuery.data) {
    return <EmptyState title="意向名单暂不可用" />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-lg font-bold text-foreground">{projectDetail.data.project.title}</Text>
        <Text className="text-sm text-muted mt-1 leading-5">这里只展示负责人查看意向所需的最小公开字段，不返回手机号、邮箱、证件或内部账号标识。</Text>
        <View className="flex-row flex-wrap gap-2 mt-3">
          <StatusBadge label={`关注 ${summaryQuery.data.counts.follow}`} tone="gray" small />
          <StatusBadge label={`试用 ${summaryQuery.data.counts.trial}`} tone="teal" small />
          <StatusBadge label={`购买 ${summaryQuery.data.counts.purchase_interest}`} tone="blue" small />
          <StatusBadge label={`合作 ${summaryQuery.data.counts.collaboration_interest}`} tone="orange" small />
        </View>
        <View className="mt-3">
          <PrimaryButton title="返回项目意向" variant="outline" small onPress={() => router.replace(`/projects/project-intention/${projectId}` as never)} />
        </View>
      </View>

      <View className="mt-4">
        {!listQuery.data || listQuery.data.length === 0 ? (
          <EmptyState title="暂无意向名单" hint="当前项目还没有活跃的用户意向登记。" />
        ) : (
          listQuery.data.map((item, index) => (
            <View key={`${item.intentionType}-${item.createdAt}-${index}`} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row items-center gap-3">
                <Avatar name={item.displayName} size={42} />
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">{item.displayName}</Text>
                  <Text className="text-xs text-muted mt-1">{item.cityName || "城市未公开"}</Text>
                </View>
                <StatusBadge label={PROJECT_INTENTION_TYPE_LABELS[item.intentionType as keyof typeof PROJECT_INTENTION_TYPE_LABELS] ?? item.intentionType} tone="blue" small />
              </View>
              {item.note ? (
                <View className="bg-background rounded-xl border border-border p-3 mt-3">
                  <Text className="text-xs font-medium text-muted mb-1">备注</Text>
                  <Text className="text-sm text-foreground leading-5">{item.note}</Text>
                </View>
              ) : null}
              <Text className="text-xs text-muted mt-3">登记时间：{formatTime(item.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

export default function ProjectIntentionsScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="负责人意向名单" />
      <AuthGate title="登录后查看负责人意向名单">
        <ProjectIntentionsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
