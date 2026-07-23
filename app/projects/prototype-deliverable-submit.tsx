import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, FieldLabel, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  PROTOTYPE_ACCEPTANCE_STATUS_LABELS,
  PROTOTYPE_MILESTONE_STATUS_LABELS,
  PROTOTYPE_REVISION_STATUS_LABELS,
  PROTOTYPE_TASK_TYPE_LABELS,
  StableProjectRequestIds,
  parsePrototypeMilestoneDescription,
  projectDesignPrototypeErrorMessage,
  readLocalFileBase64,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

type UploadedDeliverable = {
  id: number;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  createdAt?: Date | string | null;
};

function PrototypeDeliverableSubmitInner() {
  const params = useLocalSearchParams<{ projectId: string; milestoneId: string }>();
  const projectId = Number(params.projectId);
  const milestoneId = Number(params.milestoneId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedDeliverable[]>([]);

  const milestoneDetail = trpc.prototypeMilestones.detail.useQuery({ milestoneId }, { enabled: Number.isFinite(milestoneId), retry: 1 });
  const acceptanceStatus = trpc.prototypeAcceptances.status.useQuery(
    { milestoneId },
    { enabled: milestoneDetail.data?.milestone.status === "submitted", retry: 1 },
  );
  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId), retry: 1 });

  const uploadMutation = trpc.projects.uploadFile.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const submitMutation = trpc.prototypeMilestones.submitDeliverable.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canSubmit = capabilityCodes.includes("project.milestone.submit_deliverable");
  const canRevisionSubmit = capabilityCodes.includes("project.prototype_revision.submit");
  const nextSubmissionVersion = useMemo(() => {
    if (!milestoneDetail.data?.submissions.length) return 1;
    return Math.max(...milestoneDetail.data.submissions.map((submission) => submission.submissionVersion)) + 1;
  }, [milestoneDetail.data?.submissions]);

  const pickAndUpload = async () => {
    try {
      setError("");
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if ((asset.size ?? 0) > 8 * 1024 * 1024) {
        setError("单个文件不能超过8MB。");
        return;
      }
      const result = await uploadMutation.mutateAsync({
        projectId,
        milestoneId,
        fileName: asset.name,
        mimeType: asset.mimeType ?? undefined,
        base64Data: await readLocalFileBase64(asset.uri),
        category: "delivery",
        description: note.trim() || "原型成果文件",
        formalSubmission: true,
      });
      setUploadedFiles((current) => {
        const next = new Map(current.map((file) => [file.id, file]));
        next.set(result.id, {
          id: result.id,
          fileName: asset.name,
          mimeType: asset.mimeType ?? undefined,
          sizeBytes: asset.size ?? 0,
          createdAt: new Date().toISOString(),
        });
        return [...next.values()];
      });
    } catch (cause) {
      setError(projectDesignPrototypeErrorMessage(cause));
    }
  };

  const submitDeliverable = async () => {
    try {
      setError("");
      if (!note.trim()) {
        setError("请填写成果说明。");
        return;
      }
      if (!milestoneDetail.data) return;
      const isRevisionResubmit = milestoneDetail.data.milestone.status === "submitted"
        && acceptanceStatus.data?.currentRound?.status === "revision_requested"
        && acceptanceStatus.data?.revisionRequest?.status === "open";
      if (!(isRevisionResubmit ? canRevisionSubmit : canSubmit)) {
        setError("当前没有提交成果的权限。");
        return;
      }
      const operationKey = `prototype-submit:${milestoneId}`;
      await submitMutation.mutateAsync({
        milestoneId,
        note: note.trim(),
        fileIds: uploadedFiles.map((file) => file.id),
        expectedAuthorizationVersion: milestoneDetail.data.milestone.authorizationVersion,
        requestId: requestIds.get(operationKey),
      });
      requestIds.complete(operationKey);
      await Promise.all([
        utils.prototypeMilestones.detail.invalidate({ milestoneId }),
        utils.prototypeMilestones.list.invalidate({ projectId }),
        utils.projects.detail.invalidate({ id: projectId }),
        utils.prototypeAcceptances.status.invalidate({ milestoneId }),
        utils.prototypeAcceptances.history.invalidate({ milestoneId }),
        utils.prototypeAcceptances.revisionRequest.invalidate({ milestoneId }),
      ]);
      router.replace(`/projects/prototype-milestone/${milestoneId}` as never);
    } catch {
      // Error state is already normalized.
    }
  };

  if (milestoneDetail.isLoading || projectDetail.isLoading || acceptanceStatus.isLoading) return <LoadingView />;
  if (milestoneDetail.isError || projectDetail.isError || acceptanceStatus.isError) {
    return (
      <ErrorState
        title="成果提交页面加载失败"
        hint={projectDesignPrototypeErrorMessage(milestoneDetail.error ?? projectDetail.error ?? acceptanceStatus.error)}
        onRetry={() => {
          void milestoneDetail.refetch();
          void projectDetail.refetch();
          void acceptanceStatus.refetch();
        }}
      />
    );
  }
  if (!milestoneDetail.data || !projectDetail.data) return <EmptyState title="原型里程碑不存在或暂不可用" />;

  const milestone = milestoneDetail.data.milestone;
  const parsed = parsePrototypeMilestoneDescription(milestone.description);
  const statusKey = milestone.status;
  const status = PROTOTYPE_MILESTONE_STATUS_LABELS[statusKey] ?? { label: statusKey, tone: "gray" as const };
  const isRevisionResubmit = milestone.status === "submitted"
    && acceptanceStatus.data?.currentRound?.status === "revision_requested"
    && acceptanceStatus.data?.revisionRequest?.status === "open";
  const revisionStatus = acceptanceStatus.data?.revisionRequest
    ? (PROTOTYPE_REVISION_STATUS_LABELS[acceptanceStatus.data.revisionRequest.status] ?? { label: acceptanceStatus.data.revisionRequest.status, tone: "gray" as const })
    : null;
  const acceptanceRoundStatus = acceptanceStatus.data?.currentRound
    ? (PROTOTYPE_ACCEPTANCE_STATUS_LABELS[acceptanceStatus.data.currentRound.status] ?? { label: acceptanceStatus.data.currentRound.status, tone: "gray" as const })
    : null;

  if (milestone.status !== "in_progress" && !isRevisionResubmit) {
    return (
      <EmptyState
        title="当前状态不能提交成果"
        hint="只有初次 in_progress 提交，或处于 revision_requested 的返工重提，才能继续提交新的成果版本。"
        actionTitle="查看里程碑详情"
        onAction={() => router.replace(`/projects/prototype-milestone/${milestoneId}` as never)}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{milestone.title}</Text>
            <Text className="text-xs text-muted mt-1">
              {PROTOTYPE_TASK_TYPE_LABELS[milestone.prototypeTaskType ?? ""] ?? milestone.prototypeTaskType ?? "未设置任务类型"}
            </Text>
          </View>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <View className="mt-3">
          <InfoRow label="提交版本" value={`#${nextSubmissionVersion}`} />
          <InfoRow label="提交方式" value={isRevisionResubmit ? "返工重提" : "首次提交"} />
          <InfoRow label="计划开始" value={parsed.plannedStartAt || "-"} />
          <InfoRow label="计划结束" value={parsed.plannedEndAt || "-"} />
          <InfoRow label="启动时间" value={milestone.startedAt ? formatTime(milestone.startedAt) : "-"} />
        </View>
        {acceptanceRoundStatus ? (
          <View className="mt-3">
            <StatusBadge label={`当前验收：${acceptanceRoundStatus.label}`} tone={acceptanceRoundStatus.tone} />
          </View>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      {isRevisionResubmit && acceptanceStatus.data?.revisionRequest ? (
        <View className="bg-warning/10 rounded-2xl border border-warning/30 p-4 mt-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-base font-semibold text-foreground">当前返工要求</Text>
            {revisionStatus ? <StatusBadge label={revisionStatus.label} tone={revisionStatus.tone} small /> : null}
          </View>
          <Text className="text-sm text-foreground mt-2 leading-5">{acceptanceStatus.data.revisionRequest.reason}</Text>
          <Text className="text-xs text-muted mt-2">
            上一成果版本：#{acceptanceStatus.data.latestSubmission?.submissionVersion ?? "-"}
          </Text>
          {acceptanceStatus.data.revisionRequest.requirements.length > 0 ? (
            <View className="mt-3">
              {acceptanceStatus.data.revisionRequest.requirements.map((item, index) => (
                <Text key={`${milestoneId}-${index}`} className="text-xs text-muted leading-5">
                  {index + 1}. {item}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
        <FieldLabel label="成果说明" required />
        <AppTextInput value={note} onChangeText={setNote} placeholder={isRevisionResubmit ? "说明本次返工修正了哪些问题、如何验证" : "说明本次成果的内容、验证方式和注意事项"} multiline />
        <FieldLabel label="成果文件" />
        <Text className="text-xs text-muted mb-2">上传中的令牌不会持久化，离开页面后仅保留服务端正式记录。</Text>
        <PrimaryButton title="选择并上传成果文件" onPress={() => { void pickAndUpload(); }} loading={uploadMutation.isPending} />
      </View>

      <View className="mt-4">
        <Text className="text-base font-semibold text-foreground mb-3">本次待提交文件</Text>
        {uploadedFiles.length === 0 ? (
          <EmptyState title="尚未上传成果文件" hint="可以只填写成果说明直接提交，也可以先上传一个或多个成果文件。" />
        ) : (
          uploadedFiles.map((file) => (
            <View key={file.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <Text className="text-sm font-semibold text-foreground">{file.fileName}</Text>
              <Text className="text-xs text-muted mt-1">
                {file.mimeType ?? "未知类型"} · {(file.sizeBytes / 1024).toFixed(1)} KB · {formatTime(file.createdAt)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View className="mt-2">
        <PrimaryButton
          title={isRevisionResubmit ? "重新提交成果" : "提交成果"}
          onPress={() => { void submitDeliverable(); }}
          loading={submitMutation.isPending}
          disabled={isRevisionResubmit ? !canRevisionSubmit : !canSubmit}
        />
      </View>
    </ScrollView>
  );
}

export default function PrototypeDeliverableSubmitScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="提交原型成果" />
      <AuthGate title="登录后提交原型成果">
        <PrototypeDeliverableSubmitInner />
      </AuthGate>
    </ScreenContainer>
  );
}
