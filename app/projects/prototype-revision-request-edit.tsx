import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { PROTOTYPE_ACCEPTANCE_STATUS_LABELS, StableProjectRequestIds, projectDesignPrototypeErrorMessage } from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

function PrototypeRevisionRequestEditInner() {
  const params = useLocalSearchParams<{ milestoneId: string; submissionId: string }>();
  const milestoneId = Number(params.milestoneId);
  const submissionId = Number(params.submissionId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [reason, setReason] = useState("");
  const [requirements, setRequirements] = useState("");
  const [dueAtText, setDueAtText] = useState("");
  const [assigneeMembershipId, setAssigneeMembershipId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const statusQuery = trpc.prototypeAcceptances.status.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const projectId = statusQuery.data?.milestone.projectId ?? 0;
  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: projectId > 0, retry: 1 });
  const requestRevision = trpc.prototypeAcceptances.requestRevision.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const availableMembers = useMemo(() => projectDetail.data?.members ?? [], [projectDetail.data?.members]);
  const canRequestRevision = (projectDetail.data?.myCapabilityCodes ?? []).includes("project.prototype_acceptance.request_revision");

  if (statusQuery.isLoading || (projectId > 0 && projectDetail.isLoading)) {
    return <LoadingView text="返工表单加载中..." />;
  }
  if (statusQuery.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="返工表单加载失败"
        hint={projectDesignPrototypeErrorMessage(statusQuery.error ?? projectDetail.error)}
        onRetry={() => {
          void statusQuery.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!statusQuery.data || !projectDetail.data) {
    return <EmptyState title="返工表单暂不可用" />;
  }

  const currentRound = statusQuery.data.currentRound;
  const roundStatus = currentRound ? (PROTOTYPE_ACCEPTANCE_STATUS_LABELS[currentRound.status] ?? { label: currentRound.status, tone: "gray" as const }) : null;
  const canEdit = Boolean(currentRound?.status === "pending_review" && canRequestRevision);

  if (!canEdit) {
    return (
      <EmptyState
        title="当前状态不能要求返工"
        hint="只有待验收轮次才可以继续填写返工要求。若状态已变化，请返回验收页刷新。"
        actionTitle="返回验收状态"
        onAction={() => router.replace(`/projects/prototype-acceptance/${milestoneId}` as never)}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">要求返工</Text>
            <Text className="text-xs text-muted mt-1">返工执行人只能从当前项目有效成员中选择。</Text>
          </View>
          {roundStatus ? <StatusBadge label={roundStatus.label} tone={roundStatus.tone} /> : null}
        </View>
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
        <FieldLabel label="返工原因" required />
        <AppTextInput value={reason} onChangeText={setReason} placeholder="说明必须返工的原因" multiline />

        <FieldLabel label="具体要求" />
        <AppTextInput
          value={requirements}
          onChangeText={setRequirements}
          placeholder={"每行一条要求，例如：\n补充交互说明\n补齐原型文件\n修复工程标注"}
          multiline
        />

        <FieldLabel label="返工执行人" />
        <View className="gap-2">
          {availableMembers.map((member) => {
            const selected = assigneeMembershipId === member.membershipId;
            return (
              <Pressable
                key={member.membershipId}
                onPress={() => setAssigneeMembershipId(selected ? null : member.membershipId)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                  borderWidth: 1,
                  borderColor: selected ? "#16A34A" : "#E5E7EB",
                  backgroundColor: selected ? "#F0FDF4" : "#FFFFFF",
                  borderRadius: 16,
                  padding: 14,
                })}
              >
                <Text className="text-sm font-semibold text-foreground">{member.displayName}</Text>
                <Text className="text-xs text-muted mt-1">{member.roleCodes.join(" / ") || "项目成员"}</Text>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel label="截止时间" />
        <AppTextInput
          value={dueAtText}
          onChangeText={setDueAtText}
          placeholder="可选，例如 2026-08-01 18:00"
        />

        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <PrimaryButton title="取消" variant="muted" onPress={() => router.back()} />
          </View>
          <View className="flex-1">
            <PrimaryButton
              title="确认提交"
              variant="action"
              loading={requestRevision.isPending}
              disabled={reason.trim().length === 0}
              onPress={async () => {
                const lines = requirements
                  .split(/\n+/)
                  .map((item) => item.trim())
                  .filter(Boolean);
                const dueAt = dueAtText.trim() ? new Date(dueAtText.trim().replace(" ", "T")) : undefined;
                if (dueAt && Number.isNaN(dueAt.getTime())) {
                  setError("截止时间格式无效，请输入可识别的日期时间。");
                  return;
                }
                try {
                  setError("");
                  const operationKey = `prototype-revision:${milestoneId}:${submissionId}`;
                  await requestRevision.mutateAsync({
                    milestoneId,
                    submissionId,
                    reason: reason.trim(),
                    requirements: lines.length > 0 ? lines : undefined,
                    assigneeProjectMembershipId: assigneeMembershipId ?? undefined,
                    dueAt,
                    expectedAuthorizationVersion: statusQuery.data.milestone.authorizationVersion,
                    requestId: requestIds.get(operationKey),
                  });
                  requestIds.complete(operationKey);
                  await Promise.all([
                    utils.prototypeAcceptances.status.invalidate({ milestoneId }),
                    utils.prototypeAcceptances.history.invalidate({ milestoneId }),
                    utils.prototypeAcceptances.revisionRequest.invalidate({ milestoneId }),
                    utils.prototypeMilestones.detail.invalidate({ milestoneId }),
                  ]);
                  router.replace(`/projects/prototype-revision-request/${milestoneId}` as never);
                } catch {
                  // Error state is already normalized.
                }
              }}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default function PrototypeRevisionRequestEditScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="填写返工要求" />
      <AuthGate title="登录后填写返工要求">
        <PrototypeRevisionRequestEditInner />
      </AuthGate>
    </ScreenContainer>
  );
}
