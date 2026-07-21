import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  FUNDING_STATUS_LABELS,
  StableFundingRequestIds,
  formatFundingDate,
  fundingErrorMessage,
  fundingProgress,
  type FundingCampaignStatus,
} from "@/lib/funding-app";
import { trpc } from "@/lib/trpc";

type EvidenceItem = { title?: unknown; summary?: unknown; sourceUrl?: unknown };
type TerminalStatus = "succeeded" | "failed" | "cancelled" | "closed";

const CLOSE_ACTIONS: { status: TerminalStatus; label: string }[] = [
  { status: "succeeded", label: "标记验证成功" },
  { status: "failed", label: "标记未达目标" },
  { status: "cancelled", label: "取消活动" },
  { status: "closed", label: "提前结束" },
];

function firstEvidence(value: unknown): { title: string; summary: string; sourceUrl: string } {
  if (!Array.isArray(value) || !value.length || !value[0] || typeof value[0] !== "object") {
    return { title: "", summary: "", sourceUrl: "" };
  }
  const row = value[0] as EvidenceItem;
  return {
    title: typeof row.title === "string" ? row.title : "",
    summary: typeof row.summary === "string" ? row.summary : "",
    sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : "",
  };
}

function statusTone(status: FundingCampaignStatus): "gray" | "blue" | "green" | "orange" {
  if (status === "succeeded") return "green";
  if (status === "active") return "blue";
  if (status === "failed" || status === "cancelled") return "orange";
  return "gray";
}

function FundingCampaignManageContent({ campaignId }: { campaignId: number }) {
  const router = useRouter();
  const requests = useRef(new StableFundingRequestIds()).current;
  const utils = trpc.useUtils();
  const detail = trpc.fundingCampaigns.detail.useQuery({ campaignId });
  const supporters = trpc.fundingPledges.campaignList.useQuery({ campaignId });
  const updateMutation = trpc.fundingCampaigns.update.useMutation();
  const publishMutation = trpc.fundingCampaigns.publish.useMutation();
  const closeMutation = trpc.fundingCampaigns.close.useMutation();
  const [initializedId, setInitializedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [goalQuantity, setGoalQuantity] = useState("1");
  const [durationDays, setDurationDays] = useState("30");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [verificationSummary, setVerificationSummary] = useState("");
  const [riskSummary, setRiskSummary] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const campaign = detail.data;
    if (!campaign || initializedId === campaign.id) return;
    const evidence = firstEvidence(campaign.evidence);
    setTitle(campaign.title);
    setSummary(campaign.summary);
    setDescription(campaign.description);
    setCategoryCode(campaign.categoryCode);
    setGoalQuantity(String(campaign.goalQuantity));
    setEvidenceTitle(evidence.title);
    setEvidenceSummary(evidence.summary);
    setEvidenceUrl(evidence.sourceUrl);
    setVerificationSummary(campaign.verificationSummary ?? "");
    setRiskSummary(campaign.riskSummary);
    setInitializedId(campaign.id);
  }, [detail.data, initializedId]);

  const refresh = async () => {
    await Promise.all([detail.refetch(), supporters.refetch()]);
  };

  const invalidateAll = async (publicCode?: string) => {
    await Promise.all([
      utils.fundingCampaigns.detail.invalidate({ campaignId }),
      utils.fundingCampaigns.myList.invalidate(),
      utils.fundingCampaigns.publicList.invalidate(),
      publicCode ? utils.fundingCampaigns.publicDetail.invalidate({ publicCode }) : Promise.resolve(),
      publicCode ? utils.fundingCampaigns.publicTimeline.invalidate({ publicCode }) : Promise.resolve(),
    ]);
  };

  const validateEdit = () => {
    const quantity = Number(goalQuantity);
    const days = Number(durationDays);
    if (title.trim().length < 2 || summary.trim().length < 5 || description.trim().length < 10) return "请完整填写标题、简介和详细说明。";
    if (!categoryCode.trim()) return "请填写产品分类。";
    if (!Number.isSafeInteger(quantity) || quantity < 1) return "目标支持数量必须是正整数。";
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) return "征集周期应为 1 至 365 天。";
    if (!evidenceTitle.trim() || !evidenceSummary.trim()) return "发布前至少填写一项可核验依据。";
    if (!riskSummary.trim()) return "请如实填写风险说明。";
    return null;
  };

  const save = async () => {
    const campaign = detail.data;
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const validation = validateEdit();
    if (validation) throw new Error(validation);
    const operation = `update-${campaign.id}`;
    const result = await updateMutation.mutateAsync({
      campaignId: campaign.id,
      title: title.trim(),
      summary: summary.trim(),
      description: description.trim(),
      categoryCode: categoryCode.trim(),
      goalQuantity: Number(goalQuantity),
      evidence: [{ type: campaign.sourceType === "need" ? "need" : "prototype", title: evidenceTitle.trim(), summary: evidenceSummary.trim(), sourceUrl: evidenceUrl.trim() || undefined }],
      verificationSummary: verificationSummary.trim() || null,
      riskSummary: riskSummary.trim(),
      endsAt: new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000),
      expectedAuthorizationVersion: campaign.authorizationVersion,
      requestId: requests.get(operation),
    });
    requests.complete(operation);
    return result.campaign;
  };

  const saveDraft = async () => {
    try {
      const campaign = await save();
      setError("");
      setSuccess("草稿已保存。");
      await invalidateAll(campaign.publicCode);
    } catch (cause) {
      setSuccess("");
      setError(fundingErrorMessage(cause));
    }
  };

  const saveAndPublish = async () => {
    try {
      const saved = await save();
      const operation = `publish-${saved.id}`;
      const result = await publishMutation.mutateAsync({
        campaignId: saved.id,
        expectedAuthorizationVersion: saved.authorizationVersion,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      setError("");
      setSuccess("活动已经公开，用户可以登记非支付支持意向。");
      await invalidateAll(result.campaign.publicCode);
    } catch (cause) {
      setSuccess("");
      setError(fundingErrorMessage(cause));
    }
  };

  const close = async (targetStatus: TerminalStatus) => {
    const campaign = detail.data;
    if (!campaign) return;
    if (!closeReason.trim()) {
      setError("结束活动前请填写公开原因。");
      return;
    }
    const operation = `close-${campaign.id}-${targetStatus}`;
    try {
      const result = await closeMutation.mutateAsync({
        campaignId: campaign.id,
        targetStatus,
        reason: closeReason.trim(),
        expectedAuthorizationVersion: campaign.authorizationVersion,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      setError("");
      setSuccess(`活动已更新为“${FUNDING_STATUS_LABELS[targetStatus]}”。`);
      await invalidateAll(result.campaign.publicCode);
    } catch (cause) {
      setSuccess("");
      setError(fundingErrorMessage(cause));
    }
  };

  if (detail.isLoading || supporters.isLoading) return <LoadingView text="正在加载筹措管理信息…" />;
  if (detail.isError || !detail.data) return <ErrorState title="无法管理此活动" hint={fundingErrorMessage(detail.error)} onRetry={refresh} />;

  const campaign = detail.data;
  const status = campaign.status as FundingCampaignStatus;
  const editable = status === "draft" || status === "reviewing";
  const progress = fundingProgress(campaign.pledgedQuantity, campaign.goalQuantity);
  const busy = updateMutation.isPending || publishMutation.isPending || closeMutation.isPending;
  const supporterRows = supporters.data ?? [];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={detail.isRefetching || supporters.isRefetching} onRefresh={refresh} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-center justify-between gap-3">
          <StatusBadge label={FUNDING_STATUS_LABELS[status]} tone={statusTone(status)} />
          <Text className="text-xs text-muted">版本 {campaign.authorizationVersion}</Text>
        </View>
        <Text className="text-xl font-bold text-foreground mt-3">{campaign.title}</Text>
        <View className="h-2 bg-border rounded-full overflow-hidden mt-4"><View className="h-2 bg-primary" style={{ width: `${progress}%` }} /></View>
        <Text className="text-sm text-foreground mt-2">{campaign.pledgedQuantity} / {campaign.goalQuantity} 份 · {campaign.activePledgeCount} 位支持者</Text>
        {campaign.visibility === "public" ? (
          <Pressable onPress={() => router.push(`/funding/${campaign.publicCode}` as never)} className="mt-3"><Text className="text-sm text-primary font-semibold">查看公开页面</Text></Pressable>
        ) : null}
      </View>

      {editable ? (
        <View className="mt-5">
          <Text className="text-xl font-bold text-foreground mb-2">编辑活动</Text>
          <FieldLabel label="活动标题" required /><AppTextInput value={title} onChangeText={setTitle} />
          <FieldLabel label="一句话简介" required /><AppTextInput value={summary} onChangeText={setSummary} multiline />
          <FieldLabel label="详细说明" required /><AppTextInput value={description} onChangeText={setDescription} multiline />
          <FieldLabel label="产品分类" required /><AppTextInput value={categoryCode} onChangeText={setCategoryCode} />
          <FieldLabel label="目标支持数量" required /><AppTextInput value={goalQuantity} onChangeText={setGoalQuantity} keyboardType="numeric" />
          <FieldLabel label="从现在起征集天数" required /><AppTextInput value={durationDays} onChangeText={setDurationDays} keyboardType="numeric" />
          <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
            <Text className="text-base font-bold text-foreground">可核验依据</Text>
            <FieldLabel label="依据标题" required /><AppTextInput value={evidenceTitle} onChangeText={setEvidenceTitle} />
            <FieldLabel label="依据摘要" required /><AppTextInput value={evidenceSummary} onChangeText={setEvidenceSummary} multiline />
            <FieldLabel label="公开链接（可选）" /><AppTextInput value={evidenceUrl} onChangeText={setEvidenceUrl} autoCapitalize="none" />
            <FieldLabel label="核验结论（可选）" /><AppTextInput value={verificationSummary} onChangeText={setVerificationSummary} multiline />
          </View>
          <FieldLabel label="风险说明" required /><AppTextInput value={riskSummary} onChangeText={setRiskSummary} multiline />
          <View className="flex-row gap-3 mt-5">
            <View className="flex-1"><PrimaryButton title="保存草稿" variant="outline" disabled={busy} loading={updateMutation.isPending} onPress={saveDraft} /></View>
            <View className="flex-1"><PrimaryButton title="保存并发布" disabled={busy} loading={busy} onPress={saveAndPublish} /></View>
          </View>
        </View>
      ) : null}

      {status === "active" ? (
        <View className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mt-6">
          <Text className="text-lg font-bold text-foreground">结束活动</Text>
          <Text className="text-sm text-muted leading-6 mt-2">结束状态不可直接回退；原因会进入追加事件和审计记录。</Text>
          <FieldLabel label="公开原因" required /><AppTextInput value={closeReason} onChangeText={setCloseReason} multiline />
          <View className="flex-row flex-wrap gap-2 mt-3">
            {CLOSE_ACTIONS.map((action) => (
              <View key={action.status} className="min-w-[47%] flex-1"><PrimaryButton title={action.label} variant="outline" disabled={busy} onPress={() => close(action.status)} /></View>
            ))}
          </View>
        </View>
      ) : null}

      {success ? <Text className="text-sm text-success mt-4">{success}</Text> : null}
      {error ? <Text className="text-sm text-error mt-4">{error}</Text> : null}

      <Text className="text-xl font-bold text-foreground mt-7 mb-3">有效支持意向</Text>
      {supporterRows.length === 0 ? <EmptyState title="暂无有效支持意向" /> : supporterRows.map((supporter, index) => (
        <View key={`${supporter.displayName}-${supporter.createdAt.toString()}-${index}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-base font-semibold text-foreground">{supporter.displayName}</Text>
            <Text className="text-sm font-bold text-primary">{supporter.quantity} 份</Text>
          </View>
          <Text className="text-xs text-muted mt-2">{supporter.cityName || "未提供城市"} · {formatFundingDate(supporter.createdAt)}</Text>
          {supporter.note ? <Text className="text-sm text-muted leading-6 mt-2">{supporter.note}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

export default function FundingCampaignManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const campaignId = Number(id);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="筹措活动管理" />
      <AuthGate title="登录后管理筹措活动">
        {Number.isSafeInteger(campaignId) && campaignId > 0 ? <FundingCampaignManageContent campaignId={campaignId} /> : <EmptyState title="活动不存在" />}
      </AuthGate>
    </ScreenContainer>
  );
}
