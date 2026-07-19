import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import {
  AppTextInput,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  LoadingView,
  PrimaryButton,
  StatusBadge,
} from "@/components/common";
import { MILESTONE_STATUS, PROJECT_STATUS, formatTime } from "@/lib/labels";

function ProjectDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const router = useRouter();
  const utils = trpc.useUtils();
  const detail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: !Number.isNaN(projectId) });

  const [error, setError] = useState("");
  const [deliverTarget, setDeliverTarget] = useState<number | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [acceptTarget, setAcceptTarget] = useState<number | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<number | null>(null);
  const [revisionReason, setRevisionReason] = useState("");

  const invalidate = () => {
    utils.projects.detail.invalidate({ id: projectId });
    utils.projects.list.invalidate();
  };

  const confirmMut = trpc.projects.confirm.useMutation({ onSuccess: invalidate, onError: (e) => setError(e.message) });
  const submitMut = trpc.projects.submitMilestone.useMutation({
    onSuccess: () => {
      setDeliverTarget(null);
      setDeliveryNote("");
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const acceptMut = trpc.projects.acceptMilestone.useMutation({
    onSuccess: () => {
      setAcceptTarget(null);
      invalidate();
    },
    onError: (e) => {
      setAcceptTarget(null);
      setError(e.message);
    },
  });
  const revisionMut = trpc.projects.requestRevision.useMutation({
    onSuccess: () => {
      setRevisionTarget(null);
      setRevisionReason("");
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const startChat = trpc.messagesRouter.start.useMutation({
    onSuccess: (res) => router.push(`/chat/${res.conversationId}` as any),
  });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="项目不存在或无权查看" />;

  const { project, milestones, requirements, files, changes, acceptances, complaints, profileMap, myRole, orderId } = detail.data;
  const currentRequirement = requirements[0];
  const myAgreementConfirmed = myRole === "owner" ? Boolean(project.ownerConfirmedAt) : Boolean(project.engineerConfirmedAt);
  const st = PROJECT_STATUS[project.status] ?? { label: project.status, tone: "gray" as const };
  const otherId = myRole === "owner" ? project.engineerId : project.ownerId;
  const otherName = profileMap[otherId]?.nickname ?? (myRole === "owner" ? "工程师" : "需求方");

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <View className="flex-row items-center justify-between mb-2">
            <StatusBadge label={st.label} tone={st.tone} />
            <Text className="text-xs text-muted">{formatTime(project.createdAt)}</Text>
          </View>
          <Text className="text-xl font-bold text-foreground leading-7">{project.title}</Text>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-lg font-bold text-action">¥{project.totalAmount}</Text>
            <Text className="text-xs text-muted">{myRole === "owner" ? `工程师:${otherName}` : `需求方:${otherName}`}</Text>
          </View>
          <View className="mt-3">
            <PrimaryButton
              title={`联系${myRole === "owner" ? "工程师" : "需求方"}`}
              variant="outline"
              small
              onPress={() => startChat.mutate({ targetUserId: otherId, refType: "project", refId: project.id })}
              loading={startChat.isPending}
            />
          </View>
        </View>

        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-base font-semibold text-foreground">项目协作</Text>
          <View className="flex-row gap-2 mt-3">
            <View className="flex-1"><PrimaryButton title={`文件 ${files.length}`} variant="outline" small onPress={() => router.push(`/project-files/${project.id}` as any)} /></View>
            <View className="flex-1"><PrimaryButton title={`变更 ${changes.length}`} variant="outline" small onPress={() => router.push(`/project-changes/${project.id}` as any)} /></View>
            <View className="flex-1"><PrimaryButton title={`争议 ${complaints.length}`} variant="outline" small onPress={() => complaints[0] ? router.push(`/complaints/${complaints[0].id}` as any) : router.push(`/complaints/create?projectId=${project.id}` as any)} /></View>
          </View>
        </View>

        {/* 正式需求与双方确认 */}
        {["pending_confirmation", "pending_agreement"].includes(project.status) ? (
          <View className="bg-warning/10 rounded-2xl p-4 mt-3 border border-warning/30">
            <Text className="text-base font-semibold text-foreground">正式需求与合作条款</Text>
            <Text className="text-sm text-foreground leading-5 mt-2">{currentRequirement?.content ?? "正式需求正在生成"}</Text>
            {currentRequirement?.acceptanceCriteria ? <Text className="text-sm text-muted leading-5 mt-2">验收依据：{currentRequirement.acceptanceCriteria}</Text> : null}
            {currentRequirement?.exclusions ? <Text className="text-sm text-muted leading-5 mt-1">不包含：{currentRequirement.exclusions}</Text> : null}
            <View className="flex-row gap-3 mt-3">
              <Text className={project.ownerConfirmedAt ? "text-xs text-primary" : "text-xs text-muted"}>需求方：{project.ownerConfirmedAt ? "已确认" : "待确认"}</Text>
              <Text className={project.engineerConfirmedAt ? "text-xs text-primary" : "text-xs text-muted"}>工程师：{project.engineerConfirmedAt ? "已确认" : "待确认"}</Text>
            </View>
            {!myAgreementConfirmed ? (
              <View className="mt-3"><PrimaryButton title="确认正式需求与合作条款" onPress={() => confirmMut.mutate({ id: project.id })} loading={confirmMut.isPending} /></View>
            ) : <Text className="text-sm text-muted mt-3">你已确认，等待另一方确认后进入支付。</Text>}
          </View>
        ) : null}
        {project.status === "pending_payment" && myRole === "owner" ? (
          <View className="bg-warning/10 rounded-2xl p-4 mt-3 border border-warning/30">
            <Text className="text-sm text-foreground leading-5 mb-3">双方已确认正式需求与条款。请通过支付单完成沙箱确认，成功后项目款项进入可追溯托管记录。</Text>
            <PrimaryButton title={`进入沙箱支付 ¥${project.totalAmount}`} variant="action" disabled={!orderId} onPress={() => orderId && router.push(`/payments/${orderId}` as never)} />
          </View>
        ) : null}
        {project.status === "pending_payment" && myRole === "engineer" ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-sm text-muted leading-5">双方条款已确认，等待需求方托管支付，支付完成后即可开始执行。</Text>
          </View>
        ) : null}

        {/* 里程碑 */}
        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-base font-semibold text-foreground mb-3">里程碑进度</Text>
          {milestones.length === 0 ? (
            <Text className="text-sm text-muted">暂无里程碑</Text>
          ) : (
            milestones.map((m, idx) => {
              const mst = MILESTONE_STATUS[m.status] ?? { label: m.status, tone: "gray" as const };
              const isLast = idx === milestones.length - 1;
              const canSubmit = myRole === "engineer" && ["in_progress", "revision_required"].includes(m.status) && ["in_progress", "revision"].includes(project.status);
              const canAccept = myRole === "owner" && m.status === "waiting_acceptance";
              return (
                <View key={m.id} className="flex-row">
                  <View className="items-center mr-3">
                    <View
                      className={
                        m.status === "accepted"
                          ? "w-5 h-5 rounded-full bg-primary items-center justify-center"
                          : ["in_progress", "waiting_acceptance", "revision_required"].includes(m.status)
                            ? "w-5 h-5 rounded-full bg-accent items-center justify-center"
                            : "w-5 h-5 rounded-full bg-border items-center justify-center"
                      }
                    >
                      <Text className="text-white text-[10px] font-bold">{m.status === "accepted" ? "✓" : idx + 1}</Text>
                    </View>
                    {!isLast ? <View className="w-0.5 flex-1 bg-border my-0.5" /> : null}
                  </View>
                  <View className={isLast ? "flex-1 pb-1" : "flex-1 pb-4"}>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-foreground flex-1" numberOfLines={1}>
                        {m.title}
                      </Text>
                      <StatusBadge label={mst.label} tone={mst.tone} small />
                    </View>
                    {m.description ? <Text className="text-xs text-muted mt-0.5 leading-4">{m.description}</Text> : null}
                    {m.amount ? <Text className="text-xs text-action mt-0.5">款项 ¥{m.amount}</Text> : null}
                    {m.deliveryNote ? (
                      <View className="bg-background rounded-lg p-2.5 mt-1.5 border border-border">
                        <Text className="text-xs font-medium text-muted mb-0.5">交付说明</Text>
                        <Text className="text-xs text-foreground leading-4">{m.deliveryNote}</Text>
                      </View>
                    ) : null}
                    {m.revisionReason && m.status === "revision_required" ? (
                      <View className="bg-error/5 rounded-lg p-2.5 mt-1.5 border border-error/20">
                        <Text className="text-xs font-medium text-error mb-0.5">修改要求</Text>
                        <Text className="text-xs text-foreground leading-4">{m.revisionReason}</Text>
                      </View>
                    ) : null}
                    {canSubmit ? (
                      <View className="mt-2">
                        <PrimaryButton title="提交交付" small onPress={() => setDeliverTarget(m.id)} />
                      </View>
                    ) : null}
                    {canAccept ? (
                      <>
                        <View className="flex-row gap-2 mt-2">
                          <View className="flex-1">
                            <PrimaryButton title="验收通过" small onPress={() => setAcceptTarget(m.id)} />
                          </View>
                          <View className="flex-1">
                            <PrimaryButton title="要求修改" variant="outline" small onPress={() => setRevisionTarget(m.id)} />
                          </View>
                        </View>
                        <View className="mt-2">
                          <PrimaryButton title="发起验收争议" variant="danger" small onPress={() => router.push(`/complaints/create?milestoneId=${m.id}` as any)} />
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {acceptances.length > 0 ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground mb-3">验收记录</Text>
            {acceptances.slice(0, 6).map((a) => (
              <View key={a.id} className="border-b border-border py-2 last:border-b-0">
                <Text className={a.result === "accepted" ? "text-sm font-medium text-primary" : a.result === "revision_required" ? "text-sm font-medium text-action" : "text-sm font-medium text-error"}>
                  {a.result === "accepted" ? "验收通过" : a.result === "revision_required" ? "要求修改" : "进入争议"}
                </Text>
                {a.comment ? <Text className="text-sm text-foreground mt-1 leading-5">{a.comment}</Text> : null}
                <Text className="text-xs text-muted mt-1">里程碑 #{a.milestoneId} · {formatTime(a.createdAt)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {project.status === "completed" ? (
          <View className="bg-primary/5 rounded-2xl p-4 mt-3 border border-primary/20">
            <Text className="text-sm text-foreground leading-5">
              项目已完成,结算订单已生成。可以在「我的订单」中对{myRole === "owner" ? "工程师" : "需求方"}进行评价。
            </Text>
            <View className="mt-3">
              <PrimaryButton title="查看我的订单" variant="outline" small onPress={() => router.push("/orders" as any)} />
            </View>
          </View>
        ) : null}

        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

        {/* 提交交付表单 */}
        {deliverTarget !== null ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground">提交交付说明</Text>
            <FieldLabel label="交付说明" required />
            <AppTextInput placeholder="说明本次交付的内容、如何验证等" value={deliveryNote} onChangeText={setDeliveryNote} multiline />
            <View className="mt-3">
              <PrimaryButton title="先上传交付文件" variant="outline" small onPress={() => router.push(`/project-files/${project.id}` as any)} />
            </View>
            <Text className="text-xs text-muted mt-2">正式文件上传后会保留版本记录，再回到此处提交里程碑。</Text>
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <PrimaryButton title="取消" variant="muted" onPress={() => setDeliverTarget(null)} />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  title="提交"
                  onPress={() => submitMut.mutate({ milestoneId: deliverTarget, deliveryNote: deliveryNote.trim() })}
                  loading={submitMut.isPending}
                  disabled={deliveryNote.trim().length < 2}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* 要求修改表单 */}
        {revisionTarget !== null ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground">要求修改</Text>
            <FieldLabel label="修改原因" required />
            <AppTextInput placeholder="请具体说明需要修改的内容" value={revisionReason} onChangeText={setRevisionReason} multiline />
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <PrimaryButton title="取消" variant="muted" onPress={() => setRevisionTarget(null)} />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  title="提交修改要求"
                  variant="action"
                  onPress={() => revisionMut.mutate({ milestoneId: revisionTarget, reason: revisionReason.trim() })}
                  loading={revisionMut.isPending}
                  disabled={revisionReason.trim().length < 2}
                />
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={acceptTarget !== null}
        title="验收通过"
        message="验收通过后将创建该里程碑的阶段结算申请，资金仍需财务审核后从托管中释放。此操作不可撤销，确认验收吗？"
        confirmText="确认验收"
        loading={acceptMut.isPending}
        onCancel={() => setAcceptTarget(null)}
        onConfirm={() => acceptTarget && acceptMut.mutate({ milestoneId: acceptTarget })}
      />
    </KeyboardAvoidingView>
  );
}

export default function ProjectDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="项目详情" />
      <AuthGate title="登录后查看项目">
        <ProjectDetailInner />
      </AuthGate>
    </ScreenContainer>
  );
}
