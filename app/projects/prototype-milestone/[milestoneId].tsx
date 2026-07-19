import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  ControlledAccessTracker,
  PROTOTYPE_ACCEPTANCE_STATUS_LABELS,
  PROTOTYPE_MILESTONE_STATUS_LABELS,
  PROTOTYPE_TASK_TYPE_LABELS,
  parsePrototypeMilestoneDescription,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function PrototypeMilestoneDetailInner() {
  const { milestoneId: rawMilestoneId } = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = Number(rawMilestoneId);
  const router = useRouter();
  const accessTracker = useRef(new ControlledAccessTracker()).current;
  const [error, setError] = useState("");
  const detail = trpc.prototypeMilestones.detail.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const acceptanceStatus = trpc.prototypeAcceptances.status.useQuery(
    { milestoneId },
    { enabled: Boolean(detail.data?.submissions.length), retry: 1 },
  );
  const projectDetail = trpc.projects.detail.useQuery(
    { id: detail.data?.milestone.projectId ?? 0 },
    { enabled: Boolean(detail.data?.milestone.projectId) },
  );
  const deliverableAccess = trpc.prototypeMilestones.deliverableFileAccess.useMutation();

  useEffect(() => {
    return () => {
      void accessTracker.cleanup();
    };
  }, [accessTracker]);

  const memberMap = useMemo(() => {
    const map = new Map<number, { displayName: string }>();
    (projectDetail.data?.members ?? []).forEach((member) => {
      map.set(member.membershipId, { displayName: member.displayName });
    });
    return map;
  }, [projectDetail.data?.members]);

  if (detail.isLoading || (detail.data?.milestone.projectId && projectDetail.isLoading)) return <LoadingView />;
  if (detail.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="原型里程碑加载失败"
        hint={projectDesignPrototypeErrorMessage(detail.error ?? projectDetail.error)}
        onRetry={() => {
          void detail.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!detail.data) return <EmptyState title="原型里程碑不存在或暂不可用" />;

  const parsed = parsePrototypeMilestoneDescription(detail.data.milestone.description);
  const statusKey = detail.data.milestone.status;
  const status = PROTOTYPE_MILESTONE_STATUS_LABELS[statusKey] ?? { label: statusKey, tone: "gray" as const };
  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canEdit = capabilityCodes.includes("project.milestone.edit");
  const canSubmit = capabilityCodes.includes("project.milestone.submit_deliverable");
  const canRevisionSubmit = capabilityCodes.includes("project.prototype_revision.submit");
  const assignee = detail.data.milestone.assigneeProjectMembershipId ? memberMap.get(detail.data.milestone.assigneeProjectMembershipId)?.displayName : null;
  const starter = detail.data.milestone.startedByProjectMembershipId ? memberMap.get(detail.data.milestone.startedByProjectMembershipId)?.displayName : null;
  const lastSubmitter = detail.data.milestone.lastSubmittedByProjectMembershipId ? memberMap.get(detail.data.milestone.lastSubmittedByProjectMembershipId)?.displayName : null;
  const acceptanceBadge = acceptanceStatus.data?.currentRound
    ? (PROTOTYPE_ACCEPTANCE_STATUS_LABELS[acceptanceStatus.data.currentRound.status] ?? { label: acceptanceStatus.data.currentRound.status, tone: "gray" as const })
    : null;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{detail.data.milestone.title}</Text>
            <Text className="text-xs text-muted mt-1">
              {PROTOTYPE_TASK_TYPE_LABELS[detail.data.milestone.prototypeTaskType ?? ""] ?? detail.data.milestone.prototypeTaskType ?? "未设置任务类型"}
            </Text>
          </View>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        {parsed.description ? <Text className="text-sm text-foreground mt-3 leading-5">{parsed.description}</Text> : null}
        <View className="mt-3">
          <InfoRow label="负责人" value={assignee ?? "-"} />
          <InfoRow label="计划开始" value={parsed.plannedStartAt || "-"} />
          <InfoRow label="计划结束" value={parsed.plannedEndAt || "-"} />
          <InfoRow label="备注" value={parsed.note || "-"} />
          <InfoRow label="启动成员" value={starter ?? "-"} />
          <InfoRow label="最近提交" value={lastSubmitter ?? "-"} />
          <InfoRow label="启动时间" value={detail.data.milestone.startedAt ? formatTime(detail.data.milestone.startedAt) : "-"} />
          <InfoRow label="提交时间" value={detail.data.milestone.submittedAt ? formatTime(detail.data.milestone.submittedAt) : "-"} />
        </View>
        <View className="flex-row flex-wrap gap-2 mt-3">
          <PrimaryButton title="返回列表" variant="outline" small onPress={() => router.push(`/projects/prototype-milestones/${detail.data.milestone.projectId}` as never)} />
          {detail.data.milestone.status === "planned" && canEdit ? (
            <PrimaryButton title="编辑里程碑" variant="muted" small onPress={() => router.push(`/projects/prototype-milestone-edit?projectId=${detail.data.milestone.projectId}&milestoneId=${detail.data.milestone.id}` as never)} />
          ) : null}
          {detail.data.milestone.status === "in_progress" && canSubmit ? (
            <PrimaryButton title="提交成果" small onPress={() => router.push(`/projects/prototype-deliverable-submit?projectId=${detail.data.milestone.projectId}&milestoneId=${detail.data.milestone.id}` as never)} />
          ) : null}
          {detail.data.milestone.status === "submitted" && acceptanceStatus.data?.currentRound ? (
            <PrimaryButton title="验收状态" variant="outline" small onPress={() => router.push(`/projects/prototype-acceptance/${detail.data.milestone.id}` as never)} />
          ) : null}
          {detail.data.milestone.status === "submitted" && acceptanceStatus.data?.currentRound?.status === "revision_requested" && canRevisionSubmit ? (
            <PrimaryButton title="重新提交成果" small onPress={() => router.push(`/projects/prototype-deliverable-submit?projectId=${detail.data.milestone.projectId}&milestoneId=${detail.data.milestone.id}` as never)} />
          ) : null}
        </View>
        {acceptanceBadge ? (
          <View className="mt-3">
            <StatusBadge label={`当前验收：${acceptanceBadge.label}`} tone={acceptanceBadge.tone} />
          </View>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="mt-4">
        <Text className="text-base font-semibold text-foreground mb-3">成果版本</Text>
        {detail.data.submissions.length === 0 ? (
          <EmptyState title="暂无成果提交" hint="里程碑启动后，由执行成员上传成果文件并正式提交。" />
        ) : (
          detail.data.submissions.map((submission) => (
            <View key={submission.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">成果版本 #{submission.submissionVersion}</Text>
                  <Text className="text-xs text-muted mt-1">{submission.submittedAt ? formatTime(submission.submittedAt) : "未提交"}</Text>
                </View>
                <StatusBadge label={submission.status} tone={submission.status === "submitted" ? "blue" : "gray"} />
              </View>
              <Text className="text-sm text-foreground mt-2 leading-5">{submission.note}</Text>
              <Text className="text-xs text-muted mt-2">提交成员：{submission.submittedByProjectMembershipId ? memberMap.get(submission.submittedByProjectMembershipId)?.displayName ?? "成员" : "成员"}</Text>
              {submission.files.length === 0 ? (
                <Text className="text-xs text-muted mt-2">暂无成果文件</Text>
              ) : (
                submission.files.map((file) => (
                  <View key={file.id} className="bg-background rounded-xl border border-border p-3 mt-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-sm font-medium text-foreground flex-1" numberOfLines={1}>{file.fileName}</Text>
                      <StatusBadge label={file.status === "disabled" ? "已停用" : "受控文件"} tone={file.status === "disabled" ? "gray" : "teal"} small />
                    </View>
                    <Text className="text-xs text-muted mt-1">
                      {file.mimeType ?? "未知类型"} · {(file.sizeBytes / 1024).toFixed(1)} KB
                    </Text>
                    {file.status === "disabled" ? (
                      <Text className="text-xs text-error mt-2">文件已禁用，旧令牌不会继续生效。</Text>
                    ) : (
                      <View className="mt-3">
                        <PrimaryButton
                          title="受控打开"
                          variant="outline"
                          small
                          loading={deliverableAccess.isPending}
                          onPress={async () => {
                            try {
                              setError("");
                              const access = await deliverableAccess.mutateAsync({ submissionFileId: file.id, purpose: "preview" });
                              await accessTracker.openPath(access.path);
                            } catch (cause) {
                              setError(projectDesignPrototypeErrorMessage(cause));
                            }
                          }}
                        />
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

export default function PrototypeMilestoneDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="原型里程碑详情" />
      <AuthGate title="登录后查看原型里程碑详情">
        <PrototypeMilestoneDetailInner />
      </AuthGate>
    </ScreenContainer>
  );
}
