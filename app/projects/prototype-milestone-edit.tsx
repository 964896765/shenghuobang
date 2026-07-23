import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, EmptyState, ErrorState, FieldLabel, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  PROTOTYPE_MILESTONE_STATUS_LABELS,
  PROTOTYPE_TASK_TYPE_LABELS,
  StableProjectRequestIds,
  composePrototypeMilestoneDescription,
  parsePrototypeMilestoneDescription,
  projectDesignPrototypeErrorMessage,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

const TASK_OPTIONS = [
  { value: "designer", label: "设计任务" },
  { value: "engineer", label: "工程任务" },
] as const;

type TaskType = (typeof TASK_OPTIONS)[number]["value"];

function PrototypeMilestoneEditInner() {
  const params = useLocalSearchParams<{ projectId: string; milestoneId?: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const projectId = Number(params.projectId);
  const milestoneId = params.milestoneId ? Number(params.milestoneId) : undefined;
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [note, setNote] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("designer");
  const [assigneeMembershipId, setAssigneeMembershipId] = useState<number | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");

  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const detail = trpc.prototypeMilestones.detail.useQuery(
    { milestoneId: milestoneId ?? 0 },
    { enabled: Boolean(milestoneId), retry: 1 },
  );

  useEffect(() => {
    if (!detail.data || hydrated) return;
    const parsed = parsePrototypeMilestoneDescription(detail.data.milestone.description);
    setTitle(detail.data.milestone.title ?? "");
    setDescription(parsed.description);
    setPlannedStartAt(parsed.plannedStartAt);
    setPlannedEndAt(parsed.plannedEndAt);
    setNote(parsed.note);
    setTaskType((detail.data.milestone.prototypeTaskType as TaskType) ?? "designer");
    setAssigneeMembershipId(detail.data.milestone.assigneeProjectMembershipId ?? undefined);
    setHydrated(true);
  }, [detail.data, hydrated]);

  const createMutation = trpc.prototypeMilestones.create.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const updateMutation = trpc.prototypeMilestones.update.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const assignMutation = trpc.prototypeMilestones.assign.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canCreate = capabilityCodes.includes("project.milestone.create");
  const canEdit = capabilityCodes.includes("project.milestone.edit");
  const canAssign = capabilityCodes.includes("project.milestone.assign");
  const members = useMemo(() => {
    return (projectDetail.data?.members ?? []).filter((member) => member.roleCodes.length > 0);
  }, [projectDetail.data?.members]);

  const compatibleMembers = useMemo(() => {
    return members.filter((member) => member.roleCodes.some((roleCode) => {
      const code = roleCode.toLowerCase();
      return taskType === "designer"
        ? code.includes("designer") || code.includes("design") || code.includes("owner")
        : code.includes("engineer") || code.includes("owner");
    }));
  }, [members, taskType]);

  const invalidate = async (targetMilestoneId?: number) => {
    await Promise.all([
      utils.prototypeMilestones.list.invalidate({ projectId }),
      utils.projects.detail.invalidate({ id: projectId }),
      targetMilestoneId ? utils.prototypeMilestones.detail.invalidate({ milestoneId: targetMilestoneId }) : Promise.resolve(),
    ]);
  };

  const save = async () => {
    try {
      setError("");
      if (!title.trim()) {
        setError("请填写里程碑标题。");
        return;
      }
      const composedDescription = composePrototypeMilestoneDescription({
        description,
        plannedStartAt,
        plannedEndAt,
        note,
      });
      if (!milestoneId) {
        if (!canCreate) {
          setError("当前没有创建原型里程碑的权限。");
          return;
        }
        const operationKey = `prototype-create:${projectId}`;
        const created = await createMutation.mutateAsync({
          projectId,
          title: title.trim(),
          description: composedDescription,
          prototypeTaskType: taskType,
          assigneeProjectMembershipId: assigneeMembershipId,
          requestId: requestIds.get(operationKey),
        });
        requestIds.complete(operationKey);
        await invalidate(created.id);
        router.replace(`/projects/prototype-milestone/${created.id}` as never);
        return;
      }
      if (!detail.data || detail.data.milestone.status !== "planned") {
        setError("当前状态不能再编辑原型里程碑。");
        return;
      }
      if (!canEdit) {
        setError("当前没有编辑原型里程碑的权限。");
        return;
      }
      const updateKey = `prototype-update:${milestoneId}`;
      const updated = await updateMutation.mutateAsync({
        milestoneId,
        title: title.trim(),
        description: composedDescription,
        prototypeTaskType: taskType,
        expectedAuthorizationVersion: detail.data.milestone.authorizationVersion,
        requestId: requestIds.get(updateKey),
      });
      requestIds.complete(updateKey);
      let nextAuthorizationVersion = updated.authorizationVersion;
      const currentAssignee = detail.data.milestone.assigneeProjectMembershipId ?? undefined;
      if (assigneeMembershipId && assigneeMembershipId !== currentAssignee && canAssign) {
        const assignKey = `prototype-assign:${milestoneId}`;
        const assigned = await assignMutation.mutateAsync({
          milestoneId,
          assigneeProjectMembershipId: assigneeMembershipId,
          expectedAuthorizationVersion: nextAuthorizationVersion,
          requestId: requestIds.get(assignKey),
        });
        requestIds.complete(assignKey);
        nextAuthorizationVersion = assigned.authorizationVersion;
      }
      await invalidate(milestoneId);
      router.replace(`/projects/prototype-milestone/${milestoneId}` as never);
    } catch {
      // Error is already normalized in mutations.
    }
  };

  if (projectDetail.isLoading || (milestoneId && detail.isLoading && !hydrated)) return <LoadingView />;
  if (projectDetail.isError || detail.isError) {
    return (
      <ErrorState
        title="原型里程碑表单加载失败"
        hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? detail.error)}
        onRetry={() => {
          void projectDetail.refetch();
          void detail.refetch();
        }}
      />
    );
  }
  if (!projectDetail.data) return <EmptyState title="项目不存在或无权访问" />;

  const status = detail.data ? (PROTOTYPE_MILESTONE_STATUS_LABELS[detail.data.milestone.status] ?? { label: detail.data.milestone.status, tone: "gray" as const }) : null;
  const readOnly = detail.data ? detail.data.milestone.status !== "planned" : false;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{milestoneId ? "编辑原型里程碑" : "创建原型里程碑"}</Text>
            <Text className="text-sm text-muted mt-1 leading-5">
              仅 planned 状态可修改标题、任务类型和指派成员；启动后转为只读。
            </Text>
          </View>
          {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
        </View>
        {detail.data ? (
          <View className="mt-3">
            <InfoRow label="任务类型" value={PROTOTYPE_TASK_TYPE_LABELS[detail.data.milestone.prototypeTaskType ?? ""] ?? detail.data.milestone.prototypeTaskType} />
            <InfoRow label="创建时间" value={formatTime(detail.data.milestone.createdAt)} />
          </View>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      {readOnly ? (
        <View className="mt-4">
          <EmptyState
            title="当前里程碑已不可编辑"
            hint="里程碑启动后主要字段只读，请返回详情查看状态，或直接进入成果提交流程。"
            actionTitle="查看详情"
            onAction={() => milestoneId && router.replace(`/projects/prototype-milestone/${milestoneId}` as never)}
          />
        </View>
      ) : (
        <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
          <FieldLabel label="标题" required />
          <AppTextInput value={title} onChangeText={setTitle} placeholder="例如：原型结构评审与交付" />
          <FieldLabel label="描述" />
          <AppTextInput value={description} onChangeText={setDescription} placeholder="说明本次里程碑要完成的原型目标和产出" multiline />
          <FieldLabel label="任务类型" required />
          <ChipSelector options={[...TASK_OPTIONS]} value={taskType} onChange={(value) => setTaskType(value)} />
          <FieldLabel label="计划开始时间" />
          <AppTextInput value={plannedStartAt} onChangeText={setPlannedStartAt} placeholder="例如：2026-07-25 09:00" />
          <FieldLabel label="计划结束时间" />
          <AppTextInput value={plannedEndAt} onChangeText={setPlannedEndAt} placeholder="例如：2026-07-28 18:00" />
          <FieldLabel label="备注" />
          <AppTextInput value={note} onChangeText={setNote} placeholder="补充提醒、协作要求或验收前说明" multiline />
          <FieldLabel label="指派成员" />
          {compatibleMembers.length === 0 ? (
            <Text className="text-sm text-muted">当前项目中没有与任务类型匹配的有效成员，请切换任务类型或稍后再试。</Text>
          ) : (
            <ChipSelector
              options={compatibleMembers.map((member) => ({
                value: String(member.membershipId),
                label: member.displayName,
              }))}
              value={assigneeMembershipId ? String(assigneeMembershipId) : undefined}
              onChange={(value) => setAssigneeMembershipId(Number(value))}
            />
          )}
          <View className="mt-4">
            <PrimaryButton
              title={milestoneId ? "保存里程碑" : "创建里程碑"}
              onPress={() => { void save(); }}
              loading={createMutation.isPending || updateMutation.isPending || assignMutation.isPending}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default function PrototypeMilestoneEditScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="原型里程碑" />
      <AuthGate title="登录后编辑原型里程碑">
        <PrototypeMilestoneEditInner />
      </AuthGate>
    </ScreenContainer>
  );
}
