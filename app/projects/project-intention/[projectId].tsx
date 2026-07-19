import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  PROJECT_INTENTION_DISCLAIMERS,
  PROJECT_INTENTION_TYPE_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
  validateProjectIntentionNoteInput,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

const intentionOptions = [
  { value: "follow", label: PROJECT_INTENTION_TYPE_LABELS.follow },
  { value: "trial", label: PROJECT_INTENTION_TYPE_LABELS.trial },
  { value: "purchase_interest", label: PROJECT_INTENTION_TYPE_LABELS.purchase_interest },
  { value: "collaboration_interest", label: PROJECT_INTENTION_TYPE_LABELS.collaboration_interest },
] as const;

function ProjectIntentionInner() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawProjectId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const [selectedType, setSelectedType] = useState<(typeof intentionOptions)[number]["value"]>("follow");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId), retry: 0 });
  const summaryQuery = trpc.projectIntentions.summary.useQuery({ projectId }, { enabled: Number.isFinite(projectId), retry: 1 });
  const mineQuery = trpc.projectIntentions.listMine.useQuery(undefined, { retry: 1 });
  const registerMutation = trpc.projectIntentions.register.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const withdrawMutation = trpc.projectIntentions.withdraw.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });

  const mineForProject = useMemo(() => {
    return (mineQuery.data ?? [])
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  }, [mineQuery.data, projectId]);
  const activeIntention = mineForProject.find((item) => item.status === "active") ?? null;
  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canViewProjectIntentions = capabilityCodes.includes("project.intention.view_project");
  const isMember = Boolean(projectDetail.data?.myMembershipId);
  const publicEligible = Boolean(summaryQuery.data?.publicEligible);
  const canRegister = isMember || publicEligible;
  const projectTitle = projectDetail.data?.project.title ?? summaryQuery.data?.projectTitle ?? `项目 #${projectId}`;

  useEffect(() => {
    if (!activeIntention) return;
    setSelectedType((activeIntention.intentionType as (typeof intentionOptions)[number]["value"]) ?? "follow");
    setNote(activeIntention.note ?? "");
  }, [activeIntention]);

  if (mineQuery.isLoading || (projectDetail.isLoading && summaryQuery.isLoading)) {
    return <LoadingView text="项目意向加载中..." />;
  }

  const criticalError = !projectDetail.data && !summaryQuery.data && (projectDetail.isError || summaryQuery.isError);
  if (criticalError) {
    return (
      <ErrorState
        title="项目意向暂不可用"
        hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? summaryQuery.error)}
        onRetry={() => {
          void projectDetail.refetch();
          void summaryQuery.refetch();
          void mineQuery.refetch();
        }}
      />
    );
  }
  if (!canRegister && !canViewProjectIntentions) {
    return <EmptyState title="当前项目暂不支持登记意向" hint="仅对明确可公开访问或你已授权参与的项目开放项目意向登记。" />;
  }

  const selectedDisclaimer = PROJECT_INTENTION_DISCLAIMERS[selectedType];
  const currentStatusLabel = activeIntention ? PROJECT_INTENTION_TYPE_LABELS[activeIntention.intentionType as keyof typeof PROJECT_INTENTION_TYPE_LABELS] ?? activeIntention.intentionType : "未登记";

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-lg font-bold text-foreground">{projectTitle}</Text>
        <Text className="text-sm text-muted mt-1 leading-5">登记关注、试用、购买或合作意向。该流程不会创建订单、支付、库存锁定或项目成员关系。</Text>
        <View className="flex-row flex-wrap gap-2 mt-3">
          {summaryQuery.data ? (
            <>
              <StatusBadge label={`关注 ${summaryQuery.data.counts.follow}`} tone="gray" small />
              <StatusBadge label={`试用 ${summaryQuery.data.counts.trial}`} tone="teal" small />
              <StatusBadge label={`购买 ${summaryQuery.data.counts.purchase_interest}`} tone="blue" small />
              <StatusBadge label={`合作 ${summaryQuery.data.counts.collaboration_interest}`} tone="orange" small />
            </>
          ) : null}
        </View>
        {activeIntention ? (
          <Text className="text-xs text-muted mt-3">
            我的当前意向：{currentStatusLabel} · {formatTime(activeIntention.createdAt)}
          </Text>
        ) : (
          <Text className="text-xs text-muted mt-3">你尚未登记该项目意向。</Text>
        )}
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
        <Text className="text-base font-semibold text-foreground">登记意向</Text>
        <Text className="text-xs text-muted mt-1 leading-5">{selectedDisclaimer}</Text>
        <View className="mt-3">
          <ChipSelector options={intentionOptions as any} value={selectedType} onChange={(value) => setSelectedType(value as typeof selectedType)} />
        </View>
        <Text className="text-sm font-medium text-foreground mb-1.5 mt-3">备注</Text>
        <AppTextInput
          value={note}
          onChangeText={setNote}
          placeholder="可选填写补充说明，不能包含手机号、邮箱或证件信息"
          multiline
        />
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1">
            <PrimaryButton
              title="登记"
              loading={registerMutation.isPending}
              disabled={!canRegister}
              onPress={async () => {
                const validated = validateProjectIntentionNoteInput(note);
                if (!validated.ok) {
                  setError(validated.message);
                  return;
                }
                try {
                  setError("");
                  const operationKey = `project-intention-register:${projectId}:${selectedType}`;
                  await registerMutation.mutateAsync({
                    projectId,
                    intentionType: selectedType,
                    note: validated.value || undefined,
                    requestId: requestIds.get(operationKey),
                  });
                  requestIds.complete(operationKey);
                  await Promise.all([
                    utils.projectIntentions.summary.invalidate({ projectId }),
                    utils.projectIntentions.listMine.invalidate(),
                  ]);
                } catch {
                  // Error state is already normalized.
                }
              }}
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              title="撤回"
              variant="outline"
              loading={withdrawMutation.isPending}
              disabled={!activeIntention}
              onPress={async () => {
                if (!activeIntention) return;
                try {
                  setError("");
                  const operationKey = `project-intention-withdraw:${activeIntention.id}`;
                  await withdrawMutation.mutateAsync({
                    intentionId: activeIntention.id,
                    requestId: requestIds.get(operationKey),
                  });
                  requestIds.complete(operationKey);
                  await Promise.all([
                    utils.projectIntentions.summary.invalidate({ projectId }),
                    utils.projectIntentions.listMine.invalidate(),
                  ]);
                } catch {
                  // Error state is already normalized.
                }
              }}
            />
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2 mt-4">
        <PrimaryButton title="我的项目意向" variant="outline" small onPress={() => router.push("/projects/my-intentions" as never)} />
        {canViewProjectIntentions ? (
          <PrimaryButton title="查看负责人名单" small onPress={() => router.push(`/projects/project-intentions/${projectId}` as never)} />
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function ProjectIntentionScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="项目意向" />
      <AuthGate title="登录后登记项目意向">
        <ProjectIntentionInner />
      </AuthGate>
    </ScreenContainer>
  );
}
