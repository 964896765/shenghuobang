import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/lib/role-context";
import {
  AppTextInput,
  Avatar,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  InfoRow,
  LoadingView,
  PrimaryButton,
  StatusBadge,
} from "@/components/common";
import { NEED_STATUS, QUOTE_STATUS, formatTime, needTypeLabel } from "@/lib/labels";
import { startLogin } from "@/constants/app";

export default function NeedDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const needId = Number(id);
  const router = useRouter();
  const { user } = useAuth();
  const { role, profile, isAuthenticated } = useRole();
  const utils = trpc.useUtils();

  const detail = trpc.needs.detail.useQuery({ id: needId }, { enabled: !Number.isNaN(needId) });

  const [tab, setTab] = useState<"detail" | "solutions" | "quotes">("detail");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [acceptTarget, setAcceptTarget] = useState<number | null>(null);
  const [closeVisible, setCloseVisible] = useState(false);

  // 工程师响应表单
  const [showSolutionForm, setShowSolutionForm] = useState(false);
  const [solApproach, setSolApproach] = useState("");
  const [solUnderstanding, setSolUnderstanding] = useState("");
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [qPrice, setQPrice] = useState("");
  const [qDays, setQDays] = useState("");
  const [qDeliverables, setQDeliverables] = useState("");
  const [qExclusions, setQExclusions] = useState("");

  const supportMut = trpc.needs.support.useMutation({ onSuccess: () => utils.needs.detail.invalidate({ id: needId }) });
  const commentMut = trpc.needs.comment.useMutation({
    onSuccess: () => {
      setComment("");
      utils.needs.detail.invalidate({ id: needId });
    },
    onError: (e) => setError(e.message),
  });
  const solutionMut = trpc.quotes.submitSolution.useMutation({
    onSuccess: () => {
      setShowSolutionForm(false);
      setSolApproach("");
      setSolUnderstanding("");
      utils.needs.detail.invalidate({ id: needId });
    },
    onError: (e) => setError(e.message),
  });
  const quoteMut = trpc.quotes.submitQuote.useMutation({
    onSuccess: () => {
      setShowQuoteForm(false);
      setQPrice("");
      setQDays("");
      setQDeliverables("");
      utils.needs.detail.invalidate({ id: needId });
    },
    onError: (e) => setError(e.message),
  });
  const acceptMut = trpc.quotes.accept.useMutation({
    onSuccess: (res) => {
      utils.needs.detail.invalidate({ id: needId });
      utils.projects.list.invalidate();
      router.push(`/projects/${res.projectId}` as any);
    },
    onError: (e) => {
      setError(e.message);
      setAcceptTarget(null);
    },
  });
  const closeMut = trpc.needs.close.useMutation({
    onSuccess: () => {
      setCloseVisible(false);
      utils.needs.detail.invalidate({ id: needId });
      utils.needs.list.invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const solvedMut = trpc.needs.markSolved.useMutation({
    onSuccess: () => utils.needs.detail.invalidate({ id: needId }),
    onError: (e) => setError(e.message),
  });

  if (detail.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="需求详情" />
        <LoadingView />
      </ScreenContainer>
    );
  }
  if (!detail.data) {
    return (
      <ScreenContainer>
        <PageHeader title="需求详情" />
        <EmptyState title="需求不存在或已删除" />
      </ScreenContainer>
    );
  }

  const { need, solutions, quotes, comments, profileMap, supported } = detail.data;
  const st = NEED_STATUS[need.status] ?? { label: need.status, tone: "gray" as const };
  const isOwner = user?.id === need.creatorId;
  const isEngineerRole = role === "engineer" && profile?.engineerStatus === "active";
  const structured = (need.structuredData ?? {}) as Record<string, string>;
  const canRespond = ["published", "collecting_solutions", "selecting_quote"].includes(need.status);
  const isPrivate = need.visibility === "private" && !isOwner;

  const TABS = [
    { key: "detail", label: "详情" },
    { key: "solutions", label: `方案 ${solutions.length}` },
    { key: "quotes", label: `报价 ${quotes.length}` },
  ] as const;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <PageHeader title="需求详情" />
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <View className="px-4">
            <View className="bg-surface rounded-2xl border border-border p-4">
              <View className="flex-row items-center justify-between mb-2">
                <StatusBadge label={st.label} tone={st.tone} />
                <Text className="text-xs text-muted">{formatTime(need.createdAt)}</Text>
              </View>
              <Text className="text-xl font-bold text-foreground leading-7">{need.title}</Text>
              <View className="flex-row items-center gap-2 mt-2 flex-wrap">
                <Text className="text-xs text-accent font-medium">{needTypeLabel(need.needType)}</Text>
                {need.category ? <Text className="text-xs text-muted">{need.category}</Text> : null}
                <Text className="text-xs text-muted">{need.cityName}</Text>
                <Text className="text-xs text-muted">
                  发布者:{profileMap[need.creatorId]?.nickname ?? "用户"}
                </Text>
              </View>
              {need.budgetMin || need.budgetMax ? (
                <Text className="text-base font-bold text-action mt-2">
                  预算 ¥{need.budgetMin ?? 0} - {need.budgetMax ? `¥${need.budgetMax}` : "不限"}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-2 mt-3">
                <View className="flex-1">
                  <PrimaryButton
                    title={supported ? "已标记同需求" : "我也需要"}
                    variant={supported ? "muted" : "outline"}
                    small
                    onPress={() => (isAuthenticated ? supportMut.mutate({ id: needId }) : startLogin())}
                  />
                </View>
                <Text className="text-xs text-muted">{need.supportCount} 人也需要</Text>
              </View>
            </View>
          </View>

          {/* Tabs */}
          <View className="flex-row px-4 gap-2 mt-4 mb-3">
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className={t.key === tab ? "bg-primary rounded-full px-4 py-1.5" : "bg-surface border border-border rounded-full px-4 py-1.5"}>
                  <Text className={t.key === tab ? "text-white text-sm font-medium" : "text-foreground text-sm"}>{t.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {tab === "detail" ? (
            <View className="px-4">
              {isPrivate ? (
                <View className="bg-surface rounded-2xl border border-border p-4">
                  <Text className="text-sm text-muted leading-5">该需求为保密需求,仅展示有限信息。如需了解详情,请联系发布者。</Text>
                </View>
              ) : (
                <View className="bg-surface rounded-2xl border border-border p-4">
                  <Text className="text-sm font-semibold text-foreground mb-1.5">问题描述</Text>
                  <Text className="text-sm text-foreground leading-6">{need.originalDescription}</Text>
                  {Object.keys(structured).length > 0 ? (
                    <View className="mt-3 pt-3 border-t border-border">
                      <Text className="text-sm font-semibold text-foreground mb-1.5">AI 整理(已确认)</Text>
                      <InfoRow label="使用对象" value={structured.target} />
                      <InfoRow label="使用场景" value={structured.scenario} />
                      <InfoRow label="当前问题" value={structured.problem} />
                      <InfoRow label="期望效果" value={structured.expectation} />
                      <InfoRow label="预算建议" value={structured.budgetSuggestion} />
                      <InfoRow label="推荐专业" value={structured.recommendedProfession} />
                      <InfoRow label="风险提示" value={structured.riskNotes} />
                    </View>
                  ) : null}
                  <View className="mt-3 pt-3 border-t border-border">
                    <InfoRow label="期望时间" value={need.expectedDeadline} />
                    <InfoRow label="服务方式" value={[need.supportsRemote ? "支持远程" : "", need.requiresOnsite ? "需要上门" : ""].filter(Boolean).join(" · ") || "不限"} />
                  </View>
                </View>
              )}

              {/* 评论 */}
              <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
                <Text className="text-sm font-semibold text-foreground mb-2">讨论 {comments.length}</Text>
                {comments.length === 0 ? (
                  <Text className="text-sm text-muted">还没有讨论,说点什么吧。</Text>
                ) : (
                  comments.map((c) => (
                    <View key={c.id} className="flex-row py-2">
                      <Avatar name={profileMap[c.userId]?.nickname} size={30} />
                      <View className="flex-1 ml-2.5">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-medium text-foreground">{profileMap[c.userId]?.nickname ?? "用户"}</Text>
                          <Text className="text-xs text-muted">{formatTime(c.createdAt)}</Text>
                        </View>
                        <Text className="text-sm text-foreground mt-0.5 leading-5">{c.content}</Text>
                      </View>
                    </View>
                  ))
                )}
                {need.allowComments && isAuthenticated ? (
                  <View className="flex-row items-center gap-2 mt-3">
                    <View className="flex-1">
                      <AppTextInput placeholder="友善发言,理性讨论" value={comment} onChangeText={setComment} />
                    </View>
                    <PrimaryButton
                      title="发送"
                      small
                      onPress={() => comment.trim() && commentMut.mutate({ id: needId, content: comment.trim() })}
                      loading={commentMut.isPending}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {tab === "solutions" ? (
            <View className="px-4">
              {solutions.length === 0 ? (
                <EmptyState title="暂无方案" hint="工程师提交的解决方案会显示在这里。" />
              ) : (
                solutions.map((s) => (
                  <View key={s.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
                    <View className="flex-row items-center mb-2">
                      <Avatar name={profileMap[s.providerId]?.nickname} size={32} />
                      <Text className="text-sm font-semibold text-foreground ml-2 flex-1">
                        {profileMap[s.providerId]?.nickname ?? "用户"}
                      </Text>
                      <Text className="text-xs text-muted">{formatTime(s.createdAt)}</Text>
                    </View>
                    {s.understanding ? (
                      <>
                        <Text className="text-xs font-medium text-muted">需求理解</Text>
                        <Text className="text-sm text-foreground leading-5 mb-2">{s.understanding}</Text>
                      </>
                    ) : null}
                    <Text className="text-xs font-medium text-muted">解决思路</Text>
                    <Text className="text-sm text-foreground leading-5">{s.approach}</Text>
                    {s.risks ? (
                      <>
                        <Text className="text-xs font-medium text-muted mt-2">风险提示</Text>
                        <Text className="text-sm text-foreground leading-5">{s.risks}</Text>
                      </>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          ) : null}

          {tab === "quotes" ? (
            <View className="px-4">
              {quotes.length === 0 ? (
                <EmptyState title="暂无报价" hint="认证工程师提交的报价会显示在这里,可以对比后选择。" />
              ) : (
                quotes.map((q) => {
                  const qst = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "gray" as const };
                  const canAccept = isOwner && ["submitted", "viewed", "negotiating"].includes(q.status) && !["project_created", "solved", "closed"].includes(need.status);
                  return (
                    <View key={q.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
                      <View className="flex-row items-center mb-2">
                        <Avatar name={profileMap[q.engineerId]?.nickname} size={32} />
                        <Text className="text-sm font-semibold text-foreground ml-2 flex-1">
                          {profileMap[q.engineerId]?.nickname ?? "工程师"}
                        </Text>
                        <StatusBadge label={qst.label} tone={qst.tone} small />
                      </View>
                      <View className="flex-row items-baseline gap-4 mb-2">
                        <Text className="text-xl font-bold text-action">¥{q.totalPrice}</Text>
                        <Text className="text-sm text-muted">工期 {q.durationDays} 天</Text>
                        <Text className="text-sm text-muted">修改 {q.revisionCount ?? 0} 次</Text>
                      </View>
                      <InfoRow label="交付内容" value={q.deliverables} />
                      <InfoRow label="不包含" value={q.exclusions} />
                      <InfoRow label="付款节点" value={q.paymentTerms} />
                      <InfoRow label="售后期" value={q.supportDays ? `${q.supportDays} 天` : null} />
                      {(isOwner || q.engineerId === user?.id) ? (
                        <View className="mt-3">
                          <PrimaryButton title="查看报价版本" variant="outline" small onPress={() => router.push(`/quotes/${q.id}` as any)} />
                        </View>
                      ) : null}
                      {canAccept ? (
                        <View className="mt-3">
                          <PrimaryButton title="接受此报价,建立项目" onPress={() => setAcceptTarget(q.id)} />
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {error ? <Text className="text-sm text-error px-4 mt-2">{error}</Text> : null}

          {/* 工程师响应操作 */}
          {isEngineerRole && canRespond && !isOwner ? (
            <View className="px-4 mt-4">
              {!showSolutionForm && !showQuoteForm ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <PrimaryButton title="提交方案" variant="outline" onPress={() => setShowSolutionForm(true)} />
                  </View>
                  {need.allowQuotes ? (
                    <View className="flex-1">
                      <PrimaryButton title="提交报价" onPress={() => setShowQuoteForm(true)} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {showSolutionForm ? (
                <View className="bg-surface rounded-2xl border border-border p-4 mt-2">
                  <Text className="text-base font-semibold text-foreground">提交解决方案</Text>
                  <FieldLabel label="需求理解" />
                  <AppTextInput placeholder="你对这个需求的理解" value={solUnderstanding} onChangeText={setSolUnderstanding} multiline />
                  <FieldLabel label="解决思路" required />
                  <AppTextInput placeholder="说明你的解决思路和实现方式" value={solApproach} onChangeText={setSolApproach} multiline />
                  <View className="flex-row gap-3 mt-4">
                    <View className="flex-1">
                      <PrimaryButton title="取消" variant="muted" onPress={() => setShowSolutionForm(false)} />
                    </View>
                    <View className="flex-1">
                      <PrimaryButton
                        title="提交方案"
                        onPress={() =>
                          solutionMut.mutate({ needId, approach: solApproach.trim(), understanding: solUnderstanding.trim() || undefined })
                        }
                        loading={solutionMut.isPending}
                        disabled={solApproach.trim().length < 5}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {showQuoteForm ? (
                <View className="bg-surface rounded-2xl border border-border p-4 mt-2">
                  <Text className="text-base font-semibold text-foreground">提交报价</Text>
                  <FieldLabel label="总价(元)" required />
                  <AppTextInput placeholder="如:3000" value={qPrice} onChangeText={setQPrice} keyboardType="numeric" />
                  <FieldLabel label="工期(天)" required />
                  <AppTextInput placeholder="如:14" value={qDays} onChangeText={setQDays} keyboardType="numeric" />
                  <FieldLabel label="交付内容" required />
                  <AppTextInput placeholder="说明你将交付什么" value={qDeliverables} onChangeText={setQDeliverables} multiline />
                  <FieldLabel label="不包含内容" />
                  <AppTextInput placeholder="说明哪些内容不在本次范围内" value={qExclusions} onChangeText={setQExclusions} multiline />
                  <View className="flex-row gap-3 mt-4">
                    <View className="flex-1">
                      <PrimaryButton title="取消" variant="muted" onPress={() => setShowQuoteForm(false)} />
                    </View>
                    <View className="flex-1">
                      <PrimaryButton
                        title="提交报价"
                        onPress={() => {
                          const price = parseInt(qPrice, 10);
                          const days = parseInt(qDays, 10);
                          if (Number.isNaN(price) || price < 1) {
                            setError("请填写有效总价");
                            return;
                          }
                          if (Number.isNaN(days) || days < 1) {
                            setError("请填写有效工期");
                            return;
                          }
                          setError("");
                          quoteMut.mutate({
                            needId,
                            totalPrice: price,
                            durationDays: days,
                            deliverables: qDeliverables.trim(),
                            exclusions: qExclusions.trim() || undefined,
                          });
                        }}
                        loading={quoteMut.isPending}
                        disabled={qDeliverables.trim().length < 2}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 创建者操作 */}
          {isOwner ? (
            <View className="px-4 mt-4 flex-row gap-3">
              {!["project_created", "solved", "closed"].includes(need.status) ? (
                <View className="flex-1">
                  <PrimaryButton title="关闭需求" variant="muted" onPress={() => setCloseVisible(true)} />
                </View>
              ) : null}
              {need.status === "project_created" ? (
                <View className="flex-1">
                  <PrimaryButton title="标记为已解决" onPress={() => solvedMut.mutate({ id: needId })} loading={solvedMut.isPending} />
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <ConfirmDialog
          visible={acceptTarget !== null}
          title="接受该报价"
          message="接受后将与该工程师建立项目,其他报价将自动标记为未选中。此操作不可撤销,确认接受吗?"
          confirmText="确认接受"
          loading={acceptMut.isPending}
          onCancel={() => setAcceptTarget(null)}
          onConfirm={() => acceptTarget && acceptMut.mutate({ needId, quoteId: acceptTarget })}
        />
        <ConfirmDialog
          visible={closeVisible}
          title="关闭需求"
          message="关闭后工程师将无法再响应该需求。确认关闭吗?"
          confirmText="关闭需求"
          danger
          loading={closeMut.isPending}
          onCancel={() => setCloseVisible(false)}
          onConfirm={() => closeMut.mutate({ id: needId })}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
