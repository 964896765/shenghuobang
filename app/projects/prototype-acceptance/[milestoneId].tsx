import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import {
  AppTextInput,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InfoRow,
  LoadingView,
  PrimaryButton,
  StatusBadge,
} from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  ControlledAccessTracker,
  PROTOTYPE_ACCEPTANCE_STATUS_LABELS,
  PROTOTYPE_REVISION_STATUS_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function PrototypeAcceptanceInner() {
  const { milestoneId: rawMilestoneId } = useLocalSearchParams<{ milestoneId: string }>();
  const milestoneId = Number(rawMilestoneId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const accessTracker = useRef(new ControlledAccessTracker()).current;
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [error, setError] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const statusQuery = trpc.prototypeAcceptances.status.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const milestoneDetail = trpc.prototypeMilestones.detail.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const projectId = statusQuery.data?.milestone.projectId ?? milestoneDetail.data?.milestone.projectId ?? 0;
  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: projectId > 0, retry: 1 });
  const deliverableAccess = trpc.prototypeMilestones.deliverableFileAccess.useMutation();
  const acceptMutation = trpc.prototypeAcceptances.accept.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

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

  const invalidateAll = async () => {
    await Promise.all([
      utils.prototypeAcceptances.status.invalidate({ milestoneId }),
      utils.prototypeAcceptances.history.invalidate({ milestoneId }),
      utils.prototypeAcceptances.revisionRequest.invalidate({ milestoneId }),
      utils.prototypeMilestones.detail.invalidate({ milestoneId }),
      projectId > 0 ? utils.projects.detail.invalidate({ id: projectId }) : Promise.resolve(),
    ]);
  };

  if (statusQuery.isLoading || milestoneDetail.isLoading || (projectId > 0 && projectDetail.isLoading)) {
    return <LoadingView text="验收状态加载中..." />;
  }
  if (statusQuery.isError || milestoneDetail.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="验收状态加载失败"
        hint={projectDesignPrototypeErrorMessage(statusQuery.error ?? milestoneDetail.error ?? projectDetail.error)}
        onRetry={() => {
          void statusQuery.refetch();
          void milestoneDetail.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!statusQuery.data || !milestoneDetail.data) {
    return <EmptyState title="验收状态不存在或暂不可用" />;
  }

  const currentRound = statusQuery.data.currentRound;
  const latestSubmission = milestoneDetail.data.submissions.find((item) => item.id === statusQuery.data.latestSubmission?.id) ?? null;
  const currentFiles = latestSubmission?.files ?? [];
  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const myMembershipId = projectDetail.data?.myMembershipId ?? null;
  const canAccept = Boolean(
    currentRound &&
      currentRound.status === "pending_review" &&
      capabilityCodes.includes("project.prototype_acceptance.accept") &&
      latestSubmission?.submittedByProjectMembershipId !== myMembershipId,
  );
  const canRequestRevision = Boolean(
    currentRound &&
      currentRound.status === "pending_review" &&
      capabilityCodes.includes("project.prototype_acceptance.request_revision") &&
      latestSubmission?.submittedByProjectMembershipId !== myMembershipId,
  );
  const canResubmit = Boolean(
    currentRound?.status === "revision_requested" &&
      statusQuery.data.revisionRequest?.status === "open" &&
      capabilityCodes.includes("project.prototype_revision.submit"),
  );
  const roundStatus = currentRound ? (PROTOTYPE_ACCEPTANCE_STATUS_LABELS[currentRound.status] ?? { label: currentRound.status, tone: "gray" as const }) : null;
  const revisionStatus = statusQuery.data.revisionRequest
    ? (PROTOTYPE_REVISION_STATUS_LABELS[statusQuery.data.revisionRequest.status] ?? { label: statusQuery.data.revisionRequest.status, tone: "gray" as const })
    : null;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{statusQuery.data.milestone.title}</Text>
            <Text className="text-xs text-muted mt-1">原型成果验收与返工闭环</Text>
          </View>
          {roundStatus ? <StatusBadge label={roundStatus.label} tone={roundStatus.tone} /> : null}
        </View>
        <View className="mt-3">
          <InfoRow label="成果版本" value={statusQuery.data.latestSubmission ? `#${statusQuery.data.latestSubmission.submissionVersion}` : "未提交"} />
          <InfoRow label="验收轮次" value={currentRound ? `第 ${currentRound.roundNo} 轮` : "未生成"} />
          <InfoRow label="提交成员" value={latestSubmission?.submittedByProjectMembershipId ? memberMap.get(latestSubmission.submittedByProjectMembershipId)?.displayName ?? "成员" : "-"} />
          <InfoRow label="提交时间" value={latestSubmission?.submittedAt ? formatTime(latestSubmission.submittedAt) : "-"} />
          <InfoRow label="验收人" value={currentRound?.reviewerProjectMembershipId ? memberMap.get(currentRound.reviewerProjectMembershipId)?.displayName ?? "成员" : "-"} />
          <InfoRow label="决定时间" value={currentRound?.decidedAt ? formatTime(currentRound.decidedAt) : "-"} />
        </View>
        {latestSubmission?.note ? (
          <View className="bg-background rounded-xl border border-border p-3 mt-3">
            <Text className="text-xs font-medium text-muted mb-1">成果说明</Text>
            <Text className="text-sm text-foreground leading-5">{latestSubmission.note}</Text>
          </View>
        ) : null}
        {currentRound?.decisionNote ? (
          <View className="bg-background rounded-xl border border-border p-3 mt-3">
            <Text className="text-xs font-medium text-muted mb-1">验收意见</Text>
            <Text className="text-sm text-foreground leading-5">{currentRound.decisionNote}</Text>
          </View>
        ) : null}
        {statusQuery.data.revisionRequest ? (
          <View className="bg-warning/10 rounded-xl border border-warning/30 p-3 mt-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-semibold text-foreground">返工要求</Text>
              {revisionStatus ? <StatusBadge label={revisionStatus.label} tone={revisionStatus.tone} small /> : null}
            </View>
            <Text className="text-sm text-foreground mt-2 leading-5">{statusQuery.data.revisionRequest.reason}</Text>
            <Text className="text-xs text-muted mt-2">
              执行人：{statusQuery.data.revisionRequest.assignedProjectMembershipId
                ? memberMap.get(statusQuery.data.revisionRequest.assignedProjectMembershipId)?.displayName ?? "成员"
                : "未指定"}
            </Text>
            <Text className="text-xs text-muted mt-1">截止时间：{statusQuery.data.revisionRequest.dueAt ? formatTime(statusQuery.data.revisionRequest.dueAt) : "未设置"}</Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2 mt-3">
          <PrimaryButton title="历史轮次" variant="outline" small onPress={() => router.push(`/projects/prototype-acceptance-history/${milestoneId}` as never)} />
          {statusQuery.data.revisionRequest ? (
            <PrimaryButton title="返工详情" variant="outline" small onPress={() => router.push(`/projects/prototype-revision-request/${milestoneId}` as never)} />
          ) : null}
          {canRequestRevision ? (
            <PrimaryButton
              title="要求返工"
              variant="action"
              small
              onPress={() => router.push(`/projects/prototype-revision-request-edit?milestoneId=${milestoneId}&submissionId=${statusQuery.data.latestSubmission?.id ?? 0}` as never)}
            />
          ) : null}
          {canResubmit ? (
            <PrimaryButton
              title="重新提交成果"
              small
              onPress={() => router.push(`/projects/prototype-deliverable-submit?projectId=${statusQuery.data.milestone.projectId}&milestoneId=${milestoneId}` as never)}
            />
          ) : null}
        </View>
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
        <Text className="text-base font-semibold text-foreground">受控成果文件</Text>
        <Text className="text-xs text-muted mt-1">每次打开都会重新申请短期访问路径，页面关闭后自动清理临时 URL 或缓存文件。</Text>
        {currentFiles.length === 0 ? (
          <EmptyState title="当前成果暂无文件" hint="可以只提交成果说明，也可以在返工后补充新的成果文件。" />
        ) : (
          currentFiles.map((file) => (
            <View key={file.id} className="bg-background rounded-xl border border-border p-3 mt-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-medium text-foreground flex-1" numberOfLines={1}>{file.fileName}</Text>
                <StatusBadge label={file.status === "disabled" ? "已停用" : "当前成果"} tone={file.status === "disabled" ? "gray" : "teal"} small />
              </View>
              <Text className="text-xs text-muted mt-1">
                {file.mimeType ?? "未知类型"} · {(file.sizeBytes / 1024).toFixed(1)} KB
              </Text>
              {file.status === "disabled" ? (
                <Text className="text-xs text-error mt-2">文件已失效，不能继续作为当前成果访问。</Text>
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

      {canAccept ? (
        <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
          <Text className="text-base font-semibold text-foreground">验收通过</Text>
          <Text className="text-sm text-muted mt-1 leading-5">提交者本人不会显示验收按钮，重复点击会复用同一 requestId。</Text>
          <AppTextInput
            value={decisionNote}
            onChangeText={setDecisionNote}
            placeholder="可选填写验收意见"
            multiline
            style={{ marginTop: 12 }}
          />
          <View className="mt-3">
            <PrimaryButton title="验收通过" onPress={() => setConfirmVisible(true)} loading={acceptMutation.isPending} />
          </View>
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmVisible}
        title="确认验收通过"
        message="确认后将结束当前验收轮次，并刷新历史与里程碑状态。若其他成员已先处理，系统会提示刷新。"
        confirmText="确认通过"
        loading={acceptMutation.isPending}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={async () => {
          if (!statusQuery.data.latestSubmission || !currentRound) return;
          try {
            setError("");
            const operationKey = `prototype-accept:${milestoneId}:${statusQuery.data.latestSubmission.id}`;
            await acceptMutation.mutateAsync({
              milestoneId,
              submissionId: statusQuery.data.latestSubmission.id,
              decisionNote: decisionNote.trim() || undefined,
              expectedAuthorizationVersion: statusQuery.data.milestone.authorizationVersion,
              requestId: requestIds.get(operationKey),
            });
            requestIds.complete(operationKey);
            setConfirmVisible(false);
            await invalidateAll();
          } catch {
            // Error state is already normalized.
          }
        }}
      />
    </ScrollView>
  );
}

export default function PrototypeAcceptanceScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="原型验收状态" />
      <AuthGate title="登录后查看验收状态">
        <PrototypeAcceptanceInner />
      </AuthGate>
    </ScreenContainer>
  );
}
