import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import { PROTOTYPE_ACCEPTANCE_STATUS_LABELS, PROTOTYPE_REVISION_STATUS_LABELS, projectDesignPrototypeErrorMessage } from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function PrototypeAcceptanceHistoryInner() {
  const { milestoneId: rawMilestoneId } = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = Number(rawMilestoneId);
  const router = useRouter();
  const historyQuery = trpc.prototypeAcceptances.history.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const projectDetail = trpc.projects.detail.useQuery(
    { id: historyQuery.data?.milestone.projectId ?? 0 },
    { enabled: Boolean(historyQuery.data?.milestone.projectId), retry: 1 },
  );

  const memberMap = useMemo(() => {
    const map = new Map<number, string>();
    (projectDetail.data?.members ?? []).forEach((member) => {
      map.set(member.membershipId, member.displayName);
    });
    return map;
  }, [projectDetail.data?.members]);

  if (historyQuery.isLoading || (historyQuery.data?.milestone.projectId && projectDetail.isLoading)) {
    return <LoadingView text="验收历史加载中..." />;
  }
  if (historyQuery.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="验收历史加载失败"
        hint={projectDesignPrototypeErrorMessage(historyQuery.error ?? projectDetail.error)}
        onRetry={() => {
          void historyQuery.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!historyQuery.data) {
    return <EmptyState title="验收历史不存在或暂不可用" />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-lg font-bold text-foreground">{historyQuery.data.milestone.title}</Text>
        <Text className="text-sm text-muted mt-1 leading-5">所有验收轮次只读展示，历史记录不会被覆盖或编辑。</Text>
        <View className="mt-3">
          <PrimaryButton title="返回当前状态" variant="outline" small onPress={() => router.replace(`/projects/prototype-acceptance/${milestoneId}` as never)} />
        </View>
      </View>

      <View className="mt-4">
        {historyQuery.data.rounds.length === 0 ? (
          <EmptyState title="暂无验收历史" hint="当前里程碑还没有形成验收轮次。" />
        ) : (
          historyQuery.data.rounds
            .slice()
            .sort((a, b) => a.roundNo - b.roundNo)
            .map((round, index, arr) => {
              const status = PROTOTYPE_ACCEPTANCE_STATUS_LABELS[round.status] ?? { label: round.status, tone: "gray" as const };
              const revisionStatus = round.revisionRequest
                ? (PROTOTYPE_REVISION_STATUS_LABELS[round.revisionRequest.status] ?? { label: round.revisionRequest.status, tone: "gray" as const })
                : null;
              const isCurrent = index === arr.length - 1;
              return (
                <View key={`${round.roundNo}-${round.createdAt}`} className="flex-row">
                  <View className="items-center mr-3">
                    <View className={isCurrent ? "w-5 h-5 rounded-full bg-primary" : "w-5 h-5 rounded-full bg-border"} />
                    {index < arr.length - 1 ? <View className="w-0.5 flex-1 bg-border my-1" /> : null}
                  </View>
                  <View className="flex-1 pb-4">
                    <View className="bg-surface rounded-2xl border border-border p-4">
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-base font-semibold text-foreground">
                            提交版本 #{round.submissionVersion ?? "-"} · 第 {round.roundNo} 轮
                          </Text>
                          <Text className="text-xs text-muted mt-1">
                            提交时间 {formatTime(round.createdAt)} · 决定时间 {round.decidedAt ? formatTime(round.decidedAt) : "未决定"}
                          </Text>
                        </View>
                        <StatusBadge label={status.label} tone={status.tone} />
                      </View>
                      {isCurrent ? <Text className="text-xs text-primary mt-2">当前轮次</Text> : null}
                      {round.decisionNote ? (
                        <View className="bg-background rounded-xl border border-border p-3 mt-3">
                          <Text className="text-xs font-medium text-muted mb-1">验收意见</Text>
                          <Text className="text-sm text-foreground leading-5">{round.decisionNote}</Text>
                        </View>
                      ) : null}
                      {round.revisionRequest ? (
                        <View className="bg-warning/10 rounded-xl border border-warning/30 p-3 mt-3">
                          <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-sm font-semibold text-foreground">返工原因</Text>
                            {revisionStatus ? <StatusBadge label={revisionStatus.label} tone={revisionStatus.tone} small /> : null}
                          </View>
                          <Text className="text-sm text-foreground mt-2 leading-5">{round.revisionRequest.reason}</Text>
                          {round.revisionRequest.requirements.length > 0 ? (
                            <View className="mt-2">
                              {round.revisionRequest.requirements.map((item, requirementIndex) => (
                                <Text key={`${round.roundNo}-${requirementIndex}`} className="text-xs text-muted leading-5">
                                  {requirementIndex + 1}. {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                          <Text className="text-xs text-muted mt-2">
                            执行人：{round.revisionRequest.assignedProjectMembershipId
                              ? memberMap.get(round.revisionRequest.assignedProjectMembershipId) ?? "成员"
                              : "未指定"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
        )}
      </View>
    </ScrollView>
  );
}

export default function PrototypeAcceptanceHistoryScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="验收历史" />
      <AuthGate title="登录后查看验收历史">
        <PrototypeAcceptanceHistoryInner />
      </AuthGate>
    </ScreenContainer>
  );
}
