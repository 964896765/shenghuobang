import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import { PROTOTYPE_REVISION_STATUS_LABELS, projectDesignPrototypeErrorMessage } from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function PrototypeRevisionRequestInner() {
  const { milestoneId: rawMilestoneId } = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = Number(rawMilestoneId);
  const router = useRouter();
  const revisionQuery = trpc.prototypeAcceptances.revisionRequest.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const statusQuery = trpc.prototypeAcceptances.status.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const historyQuery = trpc.prototypeAcceptances.history.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const projectId = statusQuery.data?.milestone.projectId ?? 0;
  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: projectId > 0, retry: 1 });

  const memberMap = useMemo(() => {
    const map = new Map<number, string>();
    (projectDetail.data?.members ?? []).forEach((member) => {
      map.set(member.membershipId, member.displayName);
    });
    return map;
  }, [projectDetail.data?.members]);

  if (revisionQuery.isLoading || statusQuery.isLoading || historyQuery.isLoading || (projectId > 0 && projectDetail.isLoading)) {
    return <LoadingView text="返工要求加载中..." />;
  }
  if (revisionQuery.isError || statusQuery.isError || historyQuery.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="返工要求加载失败"
        hint={projectDesignPrototypeErrorMessage(revisionQuery.error ?? statusQuery.error ?? historyQuery.error ?? projectDetail.error)}
        onRetry={() => {
          void revisionQuery.refetch();
          void statusQuery.refetch();
          void historyQuery.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!revisionQuery.data || !statusQuery.data || !historyQuery.data) {
    return <EmptyState title="返工要求不存在或暂不可用" />;
  }

  const revision = revisionQuery.data;
  const revisionStatus = PROTOTYPE_REVISION_STATUS_LABELS[revision.status] ?? { label: revision.status, tone: "gray" as const };
  const relatedRound = historyQuery.data.rounds.find((item) => item.revisionRequest?.id === revision.id || item.revisionRequest?.acceptanceRoundId === revision.acceptanceRoundId);
  const canResubmit = Boolean(
    revision.status === "open" &&
      (projectDetail.data?.myCapabilityCodes ?? []).includes("project.prototype_revision.submit"),
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">返工要求详情</Text>
            <Text className="text-xs text-muted mt-1">返工状态与要求保持只读，新的成果版本需要重新提交流程。</Text>
          </View>
          <StatusBadge label={revisionStatus.label} tone={revisionStatus.tone} />
        </View>
        <View className="mt-3">
          <InfoRow label="关联版本" value={relatedRound?.submissionVersion ? `#${relatedRound.submissionVersion}` : "-"} />
          <InfoRow label="创建人" value={memberMap.get(revision.createdByProjectMembershipId) ?? "成员"} />
          <InfoRow label="执行人" value={revision.assignedProjectMembershipId ? memberMap.get(revision.assignedProjectMembershipId) ?? "成员" : "未指定"} />
          <InfoRow label="截止时间" value={revision.dueAt ? formatTime(revision.dueAt) : "未设置"} />
          <InfoRow label="创建时间" value={formatTime(revision.createdAt)} />
        </View>
      </View>

      <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
        <Text className="text-base font-semibold text-foreground">返工原因</Text>
        <Text className="text-sm text-foreground leading-5 mt-2">{revision.reason}</Text>
        {revision.requirements.length > 0 ? (
          <View className="mt-4">
            <Text className="text-sm font-semibold text-foreground mb-2">具体要求</Text>
            {revision.requirements.map((item, index) => (
              <Text key={`${revision.id}-${index}`} className="text-sm text-muted leading-6">
                {index + 1}. {item}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2 mt-4">
        <PrimaryButton title="返回验收状态" variant="outline" small onPress={() => router.replace(`/projects/prototype-acceptance/${milestoneId}` as never)} />
        {canResubmit ? (
          <PrimaryButton
            title="重新提交成果"
            small
            onPress={() => router.push(`/projects/prototype-deliverable-submit?projectId=${statusQuery.data.milestone.projectId}&milestoneId=${milestoneId}` as never)}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function PrototypeRevisionRequestScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="返工要求" />
      <AuthGate title="登录后查看返工要求">
        <PrototypeRevisionRequestInner />
      </AuthGate>
    </ScreenContainer>
  );
}
