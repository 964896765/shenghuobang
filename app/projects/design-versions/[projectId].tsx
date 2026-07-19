import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ConfirmDialog, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  DESIGN_VERSION_STATUS_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

type DesignVersionItem = {
  id: number;
  versionNo: number;
  title: string;
  summary: string;
  status: string;
  createdByProjectMembershipId: number | null;
  submittedByProjectMembershipId: number | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
  authorizationVersion: number;
};

function mergeDesignVersions(current: readonly DesignVersionItem[], next: readonly DesignVersionItem[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  next.forEach((item) => merged.set(item.id, item));
  return [...merged.values()].sort((a, b) => b.versionNo - a.versionNo || b.id - a.id);
}

function DesignVersionsInner() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawProjectId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [cursor, setCursor] = useState<number | undefined>();
  const [items, setItems] = useState<DesignVersionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitTarget, setSubmitTarget] = useState<DesignVersionItem | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DesignVersionItem | null>(null);

  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const listQuery = trpc.designVersions.list.useQuery(
    { projectId, limit: 20, cursor },
    { enabled: Number.isFinite(projectId), retry: 1 },
  );

  useEffect(() => {
    if (!listQuery.data?.items) return;
    const normalized = listQuery.data.items as DesignVersionItem[];
    setItems((current) => (cursor ? mergeDesignVersions(current, normalized) : normalized));
    setNextCursor(listQuery.data.nextCursor ?? null);
  }, [cursor, listQuery.data]);

  const invalidateAll = async () => {
    await Promise.all([
      utils.designVersions.list.invalidate({ projectId }),
      utils.projects.detail.invalidate({ id: projectId }),
    ]);
    setCursor(undefined);
    const refreshed = await listQuery.refetch();
    if (refreshed.data?.items) {
      setItems(refreshed.data.items as DesignVersionItem[]);
      setNextCursor(refreshed.data.nextCursor ?? null);
    }
  };

  const submitMutation = trpc.designVersions.submit.useMutation({
    onSuccess: async () => {
      if (submitTarget) requestIds.complete(`design-submit:${submitTarget.id}`);
      setSubmitTarget(null);
      setError("");
      await invalidateAll();
    },
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const withdrawMutation = trpc.designVersions.withdraw.useMutation({
    onSuccess: async () => {
      if (withdrawTarget) requestIds.complete(`design-withdraw:${withdrawTarget.id}`);
      setWithdrawTarget(null);
      setError("");
      await invalidateAll();
    },
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const memberMap = useMemo(() => {
    const map = new Map<number, { displayName: string }>();
    (projectDetail.data?.members ?? []).forEach((member) => {
      map.set(member.membershipId, { displayName: member.displayName });
    });
    return map;
  }, [projectDetail.data?.members]);

  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canCreate = capabilityCodes.includes("project.design_version.create");
  const canEdit = capabilityCodes.includes("project.design_version.edit");
  const canSubmit = capabilityCodes.includes("project.design_version.submit");
  const currentSubmittedId = items.find((item) => item.status === "submitted")?.id ?? null;

  if (projectDetail.isLoading || (listQuery.isLoading && items.length === 0)) {
    return <LoadingView />;
  }
  if (projectDetail.isError || listQuery.isError) {
    return <ErrorState title="设计版本加载失败" hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? listQuery.error)} onRetry={() => { void projectDetail.refetch(); void listQuery.refetch(); }} />;
  }
  if (!projectDetail.data) return <EmptyState title="项目不存在或无权查看" />;

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={projectDetail.isRefetching || listQuery.isRefetching} onRefresh={() => { void invalidateAll(); }} />}
    >
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-lg font-bold text-foreground">设计版本</Text>
        <Text className="text-sm text-muted mt-1 leading-5">
          管理当前项目的设计草稿、历史版本和受控设计文件。
        </Text>
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1">
            <PrimaryButton
              title="返回项目"
              variant="outline"
              small
              onPress={() => router.back()}
            />
          </View>
          {canCreate ? (
            <View className="flex-1">
              <PrimaryButton
                title="创建设计草稿"
                small
                onPress={() => router.push(`/projects/design-version-edit?projectId=${projectId}` as never)}
              />
            </View>
          ) : null}
        </View>
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="mt-4">
        {items.length === 0 ? (
          <EmptyState
            title="暂无设计版本"
            hint={canCreate ? "先创建一个设计草稿，再上传设计文件并提交。" : "当前没有可查看的设计版本。"}
            actionTitle={canCreate ? "创建设计草稿" : undefined}
            onAction={canCreate ? (() => router.push(`/projects/design-version-edit?projectId=${projectId}` as never)) : undefined}
          />
        ) : (
          items.map((item) => {
            const status = DESIGN_VERSION_STATUS_LABELS[item.status] ?? { label: item.status, tone: "gray" as const };
            const creator = item.createdByProjectMembershipId ? memberMap.get(item.createdByProjectMembershipId)?.displayName : null;
            const submitter = item.submittedByProjectMembershipId ? memberMap.get(item.submittedByProjectMembershipId)?.displayName : null;
            const editable = item.status === "draft" && canEdit;
            const submittable = item.status === "draft" && canSubmit;
            const withdrawable = item.status === "submitted" && canEdit;
            return (
              <View key={item.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm text-muted">V{item.versionNo}</Text>
                    <Text className="text-base font-semibold text-foreground mt-1">{item.title}</Text>
                  </View>
                  <StatusBadge label={status.label} tone={status.tone} />
                </View>
                <Text className="text-sm text-foreground mt-2 leading-5">{item.summary}</Text>
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {item.id === currentSubmittedId ? <StatusBadge label="当前版本" tone="green" small /> : null}
                  {item.status === "superseded" ? <StatusBadge label="历史版本" tone="orange" small /> : null}
                  {item.status === "withdrawn" ? <StatusBadge label="只读" tone="gray" small /> : null}
                </View>
                <Text className="text-xs text-muted mt-3">
                  创建者：{creator ?? "成员"} · {formatTime(item.createdAt)}
                </Text>
                <Text className="text-xs text-muted mt-1">
                  提交者：{submitter ?? "-"} · {item.submittedAt ? formatTime(item.submittedAt) : "未提交"}
                </Text>
                <View className="flex-row flex-wrap gap-2 mt-3">
                  <PrimaryButton title="查看详情" variant="outline" small onPress={() => router.push(`/projects/design-version/${item.id}` as never)} />
                  {editable ? <PrimaryButton title="编辑草稿" variant="muted" small onPress={() => router.push(`/projects/design-version-edit?projectId=${projectId}&designVersionId=${item.id}` as never)} /> : null}
                  {submittable ? <PrimaryButton title="提交草稿" small onPress={() => setSubmitTarget(item)} /> : null}
                  {withdrawable ? <PrimaryButton title="撤回" variant="danger" small onPress={() => setWithdrawTarget(item)} /> : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      {nextCursor ? (
        <View className="mt-1">
          <PrimaryButton
            title="加载更多版本"
            variant="outline"
            onPress={() => setCursor(nextCursor)}
            loading={listQuery.isFetching && items.length > 0}
          />
        </View>
      ) : null}

      <ConfirmDialog
        visible={Boolean(submitTarget)}
        title="提交设计版本"
        message="提交后当前版本将只读，后续变更需要新建版本。"
        confirmText="确认提交"
        loading={submitMutation.isPending}
        onCancel={() => setSubmitTarget(null)}
        onConfirm={() => {
          if (!submitTarget) return;
          const operationKey = `design-submit:${submitTarget.id}`;
          const requestId = requestIds.get(operationKey);
          submitMutation.mutate({
            designVersionId: submitTarget.id,
            expectedAuthorizationVersion: submitTarget.authorizationVersion,
            requestId,
          });
        }}
      />

      <ConfirmDialog
        visible={Boolean(withdrawTarget)}
        title="撤回设计版本"
        message="撤回后该版本将保留历史记录，但不再作为当前可提交版本。"
        confirmText="确认撤回"
        danger
        loading={withdrawMutation.isPending}
        onCancel={() => setWithdrawTarget(null)}
        onConfirm={() => {
          if (!withdrawTarget) return;
          const operationKey = `design-withdraw:${withdrawTarget.id}`;
          const requestId = requestIds.get(operationKey);
          withdrawMutation.mutate({
            designVersionId: withdrawTarget.id,
            expectedAuthorizationVersion: withdrawTarget.authorizationVersion,
            requestId,
          });
        }}
      />
    </ScrollView>
  );
}

export default function DesignVersionsScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="设计版本" />
      <AuthGate title="登录后查看设计版本">
        <DesignVersionsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
