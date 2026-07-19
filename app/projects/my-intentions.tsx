import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import { PROJECT_INTENTION_TYPE_LABELS, projectDesignPrototypeErrorMessage } from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function MyIntentionsInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const mineQuery = trpc.projectIntentions.listMine.useQuery(undefined, { retry: 1 });
  const withdrawMutation = trpc.projectIntentions.withdraw.useMutation({
    onSuccess: async () => {
      await utils.projectIntentions.listMine.invalidate();
    },
  });

  if (mineQuery.isLoading) return <LoadingView text="我的意向加载中..." />;
  if (mineQuery.isError) {
    return <ErrorState title="我的意向加载失败" hint={projectDesignPrototypeErrorMessage(mineQuery.error)} onRetry={() => { void mineQuery.refetch(); }} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      {(!mineQuery.data || mineQuery.data.length === 0) ? (
        <EmptyState title="暂无项目意向" hint="在支持公开登记或你已参与的项目中，可以登记关注、试用、购买或合作意向。" />
      ) : (
        mineQuery.data.map((item) => (
          <View key={item.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">{item.projectTitle}</Text>
                <Text className="text-xs text-muted mt-1">
                  {PROJECT_INTENTION_TYPE_LABELS[item.intentionType as keyof typeof PROJECT_INTENTION_TYPE_LABELS] ?? item.intentionType}
                </Text>
              </View>
              <StatusBadge label={item.status === "active" ? "已登记" : "已撤回"} tone={item.status === "active" ? "green" : "gray"} />
            </View>
            {item.note ? <Text className="text-sm text-foreground mt-2 leading-5">{item.note}</Text> : null}
            <Text className="text-xs text-muted mt-3">登记时间：{formatTime(item.createdAt)}</Text>
            <Text className="text-xs text-muted mt-1">最近更新时间：{formatTime(item.updatedAt)}</Text>
            {!item.projectVisible ? (
              <View className="bg-background rounded-xl border border-border p-3 mt-3">
                <Text className="text-sm text-muted leading-5">该项目已不再对当前账号公开，仅保留安全的历史占位信息。</Text>
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-2 mt-3">
              {item.projectVisible ? (
                <PrimaryButton title="查看项目" variant="outline" small onPress={() => router.push(`/projects/project-intention/${item.projectId}` as never)} />
              ) : null}
              {item.status === "active" ? (
                <PrimaryButton
                  title="撤回"
                  variant="outline"
                  small
                  loading={withdrawMutation.isPending}
                  onPress={() => withdrawMutation.mutate({ intentionId: item.id, requestId: `mine-withdraw-${item.id}`.slice(0, 64) })}
                />
              ) : null}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

export default function MyIntentionsScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="我的项目意向" />
      <AuthGate title="登录后查看我的项目意向">
        <MyIntentionsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
