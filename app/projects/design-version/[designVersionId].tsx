import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ConfirmDialog, EmptyState, ErrorState, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  ControlledAccessTracker,
  DESIGN_FILE_ROLE_LABELS,
  DESIGN_VERSION_STATUS_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

type DesignVersionDetailData = {
  version: {
    id: number;
    projectId: number;
    versionNo: number;
    title: string;
    summary: string;
    changeNotes?: string | null;
    status: string;
    createdByProjectMembershipId: number | null;
    submittedByProjectMembershipId: number | null;
    createdAt?: Date | string | null;
    submittedAt?: Date | string | null;
    authorizationVersion: number;
  };
  files: {
    id: number;
    fileRole: string;
    fileName: string;
    mimeType?: string | null;
    sizeBytes: number;
    status: string;
    disabledAt?: Date | string | null;
  }[];
};

function DesignVersionDetailInner() {
  const { designVersionId: rawId } = useLocalSearchParams<{ designVersionId: string }>();
  const designVersionId = Number(rawId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const accessTracker = useRef(new ControlledAccessTracker()).current;
  const [error, setError] = useState("");
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const detail = trpc.designVersions.detail.useQuery(
    { designVersionId },
    { enabled: Number.isFinite(designVersionId), retry: 1 },
  );
  const projectDetail = trpc.projects.detail.useQuery(
    { id: detail.data?.version.projectId ?? 0 },
    { enabled: Boolean(detail.data?.version.projectId) },
  );
  const fileAccess = trpc.designVersions.fileAccess.useMutation();
  const submitMutation = trpc.designVersions.submit.useMutation({
    onSuccess: async () => {
      requestIds.complete(`design-submit:${designVersionId}`);
      setError("");
      await Promise.all([
        utils.designVersions.detail.invalidate({ designVersionId }),
        detail.data?.version.projectId ? utils.designVersions.list.invalidate({ projectId: detail.data.version.projectId }) : Promise.resolve(),
      ]);
      void detail.refetch();
    },
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const withdrawMutation = trpc.designVersions.withdraw.useMutation({
    onSuccess: async () => {
      requestIds.complete(`design-withdraw:${designVersionId}`);
      setWithdrawVisible(false);
      setError("");
      await Promise.all([
        utils.designVersions.detail.invalidate({ designVersionId }),
        detail.data?.version.projectId ? utils.designVersions.list.invalidate({ projectId: detail.data.version.projectId }) : Promise.resolve(),
      ]);
      void detail.refetch();
    },
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

  if (detail.isLoading || (detail.data?.version.projectId && projectDetail.isLoading)) return <LoadingView />;
  if (detail.isError || projectDetail.isError) {
    return (
      <ErrorState
        title="设计版本加载失败"
        hint={projectDesignPrototypeErrorMessage(detail.error ?? projectDetail.error)}
        onRetry={() => {
          void detail.refetch();
          void projectDetail.refetch();
        }}
      />
    );
  }
  if (!detail.data) return <EmptyState title="设计版本不存在或暂不可用" />;

  const data = detail.data as DesignVersionDetailData;
  const status = DESIGN_VERSION_STATUS_LABELS[data.version.status] ?? { label: data.version.status, tone: "gray" as const };
  const capabilities = projectDetail.data?.myCapabilityCodes ?? [];
  const editable = data.version.status === "draft" && capabilities.includes("project.design_version.edit");
  const submittable = data.version.status === "draft" && capabilities.includes("project.design_version.submit");
  const withdrawable = data.version.status === "submitted" && capabilities.includes("project.design_version.edit");
  const creator = data.version.createdByProjectMembershipId ? memberMap.get(data.version.createdByProjectMembershipId)?.displayName : null;
  const submitter = data.version.submittedByProjectMembershipId ? memberMap.get(data.version.submittedByProjectMembershipId)?.displayName : null;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View>
            <Text className="text-sm text-muted">V{data.version.versionNo}</Text>
            <Text className="text-xl font-bold text-foreground mt-1">{data.version.title}</Text>
          </View>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <Text className="text-sm text-foreground mt-3 leading-5">{data.version.summary}</Text>
        {data.version.changeNotes ? (
          <View className="bg-background rounded-xl border border-border p-3 mt-3">
            <Text className="text-xs text-muted mb-1">变更说明</Text>
            <Text className="text-sm text-foreground leading-5">{data.version.changeNotes}</Text>
          </View>
        ) : null}
        <View className="mt-3">
          <InfoRow label="创建成员" value={creator ?? "-"} />
          <InfoRow label="提交成员" value={submitter ?? "-"} />
          <InfoRow label="创建时间" value={formatTime(data.version.createdAt)} />
          <InfoRow label="提交时间" value={data.version.submittedAt ? formatTime(data.version.submittedAt) : "-"} />
        </View>
        <View className="flex-row flex-wrap gap-2 mt-3">
          <PrimaryButton title="返回列表" variant="outline" small onPress={() => router.push(`/projects/design-versions/${data.version.projectId}` as never)} />
          {editable ? (
            <PrimaryButton
              title="编辑草稿"
              variant="muted"
              small
              onPress={() => router.push(`/projects/design-version-edit?projectId=${data.version.projectId}&designVersionId=${data.version.id}` as never)}
            />
          ) : null}
          {submittable ? (
            <PrimaryButton
              title="提交版本"
              small
              loading={submitMutation.isPending}
              onPress={() => {
                const operationKey = `design-submit:${designVersionId}`;
                submitMutation.mutate({
                  designVersionId,
                  expectedAuthorizationVersion: data.version.authorizationVersion,
                  requestId: requestIds.get(operationKey),
                });
              }}
            />
          ) : null}
          {withdrawable ? <PrimaryButton title="撤回" variant="danger" small onPress={() => setWithdrawVisible(true)} /> : null}
        </View>
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="mt-4">
        <Text className="text-base font-semibold text-foreground mb-3">设计文件</Text>
        {data.files.length === 0 ? (
          <EmptyState title="暂无设计文件" hint="草稿阶段可返回编辑页上传设计源文件、预览图和规格说明。" />
        ) : (
          data.files.map((file) => (
            <View key={file.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-foreground flex-1" numberOfLines={1}>
                  {file.fileName}
                </Text>
                <StatusBadge
                  label={file.status === "disabled" ? "已停用" : DESIGN_FILE_ROLE_LABELS[file.fileRole] ?? file.fileRole}
                  tone={file.status === "disabled" ? "gray" : "teal"}
                  small
                />
              </View>
              <Text className="text-xs text-muted mt-1">
                {file.mimeType ?? "未知类型"} · {(file.sizeBytes / 1024).toFixed(1)} KB
              </Text>
              {file.status === "disabled" ? (
                <Text className="text-xs text-error mt-2">文件已禁用，受控访问会被立即阻止。</Text>
              ) : (
                <View className="mt-3">
                  <PrimaryButton
                    title="受控打开"
                    variant="outline"
                    small
                    loading={fileAccess.isPending}
                    onPress={async () => {
                      try {
                        setError("");
                        const access = await fileAccess.mutateAsync({ designVersionFileId: file.id, purpose: "preview" });
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

      <ConfirmDialog
        visible={withdrawVisible}
        title="撤回设计版本"
        message="撤回后该版本仅保留历史记录，不再继续使用当前设计文件。"
        confirmText="确认撤回"
        danger
        loading={withdrawMutation.isPending}
        onCancel={() => setWithdrawVisible(false)}
        onConfirm={() => {
          withdrawMutation.mutate({
            designVersionId,
            expectedAuthorizationVersion: data.version.authorizationVersion,
            requestId: requestIds.get(`design-withdraw:${designVersionId}`),
          });
        }}
      />
    </ScrollView>
  );
}

export default function DesignVersionDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="设计版本详情" />
      <AuthGate title="登录后查看设计版本详情">
        <DesignVersionDetailInner />
      </AuthGate>
    </ScreenContainer>
  );
}
