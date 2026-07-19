import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ConfirmDialog, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  PROTOTYPE_MILESTONE_STATUS_LABELS,
  PROTOTYPE_TASK_TYPE_LABELS,
  StableProjectRequestIds,
  parsePrototypeMilestoneDescription,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

type PrototypeMilestoneItem = {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  prototypeTaskType?: string | null;
  assigneeProjectMembershipId?: number | null;
  startedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
  status: string;
  authorizationVersion: number;
};

function mergeMilestones(current: readonly PrototypeMilestoneItem[], next: readonly PrototypeMilestoneItem[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  next.forEach((item) => merged.set(item.id, item));
  return [...merged.values()].sort((a, b) => a.id - b.id);
}

function MilestoneFileCount({ milestoneId }: { milestoneId: number }) {
  const detail = trpc.prototypeMilestones.detail.useQuery({ milestoneId }, { retry: 1 });
  const count = detail.data?.submissions[0]?.files.length ?? 0;
  return <Text className="text-xs text-muted mt-1">文件数量：{count}</Text>;
}

function PrototypeMilestonesInner() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawProjectId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [cursor, setCursor] = useState<number | undefined>();
  const [items, setItems] = useState<PrototypeMilestoneItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [startTarget, setStartTarget] = useState<PrototypeMilestoneItem | null>(null);

  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const listQuery = trpc.prototypeMilestones.list.useQuery(
    { projectId, limit: 20, cursor },
    { enabled: Number.isFinite(projectId), retry: 1 },
  );

  useEffect(() => {
    if (!listQuery.data?.items) return;
    const normalized = listQuery.data.items as PrototypeMilestoneItem[];
    setItems((current) => (cursor ? mergeMilestones(current, normalized) : normalized));
    setNextCursor(listQuery.data.nextCursor ?? null);
  }, [cursor, listQuery.data]);

  const invalidateAll = async () => {
    await Promise.all([
      utils.prototypeMilestones.list.invalidate({ projectId }),
      utils.projects.detail.invalidate({ id: projectId }),
    ]);
    setCursor(undefined);
    const refreshed = await listQuery.refetch();
    if (refreshed.data?.items) {
      setItems(refreshed.data.items as PrototypeMilestoneItem[]);
      setNextCursor(refreshed.data.nextCursor ?? null);
    }
  };

  const startMutation = trpc.prototypeMilestones.start.useMutation({
    onSuccess: async () => {
      if (startTarget) requestIds.complete(`prototype-start:${startTarget.id}`);
      setStartTarget(null);
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
  const canCreate = capabilityCodes.includes("project.milestone.create");
  const canEdit = capabilityCodes.includes("project.milestone.edit");
  const canStart = capabilityCodes.includes("project.milestone.start");
  const canSubmit = capabilityCodes.includes("project.milestone.submit_deliverable");

  if (projectDetail.isLoading || (listQuery.isLoading && items.length === 0)) return <LoadingView />;
  if (projectDetail.isError || listQuery.isError) {
    return <ErrorState title="原型里程碑加载失败" hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? listQuery.error)} onRetry={() => { void projectDetail.refetch(); void listQuery.refetch(); }} />;
  }
  if (!projectDetail.data) return <EmptyState title="项目不存在或无权查看" />;

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={projectDetail.isRefetching || listQuery.isRefetching} onRefresh={() => { void invalidateAll(); }} />}
    >
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-lg font-bold text-foreground">原型里程碑</Text>
        <Text className="text-sm text-muted mt-1 leading-5">
          规划原型阶段任务，指派设计师或工程师，并在成果提交前持续跟踪状态。
        </Text>
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1">
            <PrimaryButton title="返回项目" variant="outline" small onPress={() => router.back()} />
          </View>
          {canCreate ? (
            <View className="flex-1">
              <PrimaryButton title="创建里程碑" small onPress={() => router.push(`/projects/prototype-milestone-edit?projectId=${projectId}` as never)} />
            </View>
          ) : null}
        </View>
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="mt-4">
        {items.length === 0 ? (
          <EmptyState
            title="暂无原型里程碑"
            hint={canCreate ? "先创建里程碑，再指派成员并启动执行。" : "当前没有可查看的原型里程碑。"}
            actionTitle={canCreate ? "创建里程碑" : undefined}
            onAction={canCreate ? (() => router.push(`/projects/prototype-milestone-edit?projectId=${projectId}` as never)) : undefined}
          />
        ) : (
          items.map((item) => {
            const statusKey = item.status;
            const status = PROTOTYPE_MILESTONE_STATUS_LABELS[statusKey] ?? { label: statusKey, tone: "gray" as const };
            const assignee = item.assigneeProjectMembershipId ? memberMap.get(item.assigneeProjectMembershipId)?.displayName : null;
            const parsed = parsePrototypeMilestoneDescription(item.description);
            const editable = item.status === "planned" && canEdit;
            const startable = item.status === "planned" && canStart;
            const submittable = item.status === "in_progress" && canSubmit;
            return (
              <View key={item.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{item.title}</Text>
                    <Text className="text-xs text-muted mt-1">
                      {PROTOTYPE_TASK_TYPE_LABELS[item.prototypeTaskType ?? ""] ?? item.prototypeTaskType ?? "未设置任务类型"}
                    </Text>
                  </View>
                  <StatusBadge label={status.label} tone={status.tone} />
                </View>
                {parsed.description ? <Text className="text-sm text-foreground mt-2 leading-5">{parsed.description}</Text> : null}
                <Text className="text-xs text-muted mt-3">指派成员：{assignee ?? "未指派"}</Text>
                <Text className="text-xs text-muted mt-1">计划时间：{parsed.plannedStartAt || "-"} 至 {parsed.plannedEndAt || "-"}</Text>
                <Text className="text-xs text-muted mt-1">启动时间：{item.startedAt ? formatTime(item.startedAt) : "未启动"}</Text>
                <Text className="text-xs text-muted mt-1">成果提交：{item.submittedAt ? formatTime(item.submittedAt) : "未提交"}</Text>
                <MilestoneFileCount milestoneId={item.id} />
                <View className="flex-row flex-wrap gap-2 mt-3">
                  <PrimaryButton title="查看详情" variant="outline" small onPress={() => router.push(`/projects/prototype-milestone/${item.id}` as never)} />
                  {editable ? <PrimaryButton title="编辑" variant="muted" small onPress={() => router.push(`/projects/prototype-milestone-edit?projectId=${projectId}&milestoneId=${item.id}` as never)} /> : null}
                  {startable ? <PrimaryButton title="启动里程碑" small onPress={() => setStartTarget(item)} /> : null}
                  {submittable ? <PrimaryButton title="提交成果" small onPress={() => router.push(`/projects/prototype-deliverable-submit?projectId=${projectId}&milestoneId=${item.id}` as never)} /> : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      {nextCursor ? (
        <View className="mt-1">
          <PrimaryButton title="加载更多里程碑" variant="outline" onPress={() => setCursor(nextCursor)} loading={listQuery.isFetching && items.length > 0} />
        </View>
      ) : null}

      <ConfirmDialog
        visible={Boolean(startTarget)}
        title="启动原型里程碑"
        message="启动后主要字段转为只读，仅可继续提交成果。若状态已变化，系统会提示刷新。"
        confirmText="确认启动"
        loading={startMutation.isPending}
        onCancel={() => setStartTarget(null)}
        onConfirm={() => {
          if (!startTarget) return;
          const operationKey = `prototype-start:${startTarget.id}`;
          startMutation.mutate({
            milestoneId: startTarget.id,
            expectedAuthorizationVersion: startTarget.authorizationVersion,
            requestId: requestIds.get(operationKey),
          });
        }}
      />
    </ScrollView>
  );
}

export default function PrototypeMilestonesScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="原型里程碑" />
      <AuthGate title="登录后查看原型里程碑">
        <PrototypeMilestonesInner />
      </AuthGate>
    </ScreenContainer>
  );
}
