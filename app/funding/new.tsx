import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  FUNDING_SOURCE_LABELS,
  StableFundingRequestIds,
  fundingErrorMessage,
  type FundingSourceType,
} from "@/lib/funding-app";
import { trpc } from "@/lib/trpc";

type SourceOption = {
  id: number;
  type: "need" | "idea";
  title: string;
  summary: string;
  status: string;
};

function parseSourceType(value: string | undefined): "need" | "idea" {
  return value === "idea" ? "idea" : "need";
}

function NewFundingCampaignContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceType?: string; sourceId?: string }>();
  const presetSourceId = Number(params.sourceId);
  const requests = useRef(new StableFundingRequestIds()).current;
  const utils = trpc.useUtils();
  const needs = trpc.needs.list.useQuery({ scope: "mine" });
  const ideas = trpc.ideas.listMine.useQuery({ limit: 50 });
  const createMutation = trpc.fundingCampaigns.create.useMutation();
  const publishMutation = trpc.fundingCampaigns.publish.useMutation();

  const [sourceType, setSourceType] = useState<"need" | "idea">(parseSourceType(params.sourceType));
  const [sourceId, setSourceId] = useState<number | null>(Number.isSafeInteger(presetSourceId) && presetSourceId > 0 ? presetSourceId : null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [goalQuantity, setGoalQuantity] = useState("10");
  const [durationDays, setDurationDays] = useState("30");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [verificationSummary, setVerificationSummary] = useState("");
  const [riskSummary, setRiskSummary] = useState("");
  const [error, setError] = useState("");

  const sourceOptions = useMemo<SourceOption[]>(() => {
    if (sourceType === "need") {
      return (needs.data ?? []).map((item) => ({
        id: item.id,
        type: "need",
        title: item.title,
        summary: item.originalDescription ?? "暂无详细描述",
        status: item.status,
      }));
    }
    return (ideas.data ?? []).map((item) => ({
      id: item.id,
      type: "idea",
      title: item.title || "未命名创意",
      summary: item.summary || "暂无简介",
      status: item.status || "draft",
    }));
  }, [ideas.data, needs.data, sourceType]);

  const selectedSource = sourceOptions.find((item) => item.id === sourceId) ?? null;
  const busy = createMutation.isPending || publishMutation.isPending;

  const selectSource = (option: SourceOption) => {
    setSourceId(option.id);
    if (!title.trim()) setTitle(option.title);
    if (!summary.trim()) setSummary(option.summary.slice(0, 500));
  };

  const submit = async (publishNow: boolean) => {
    const quantity = Number(goalQuantity);
    const days = Number(durationDays);
    if (!sourceId) return setError("请选择一个属于你的需求或创意作为来源。");
    if (title.trim().length < 2) return setError("请填写活动标题。");
    if (summary.trim().length < 5 || description.trim().length < 10) return setError("请补充活动简介和详细说明。");
    if (!categoryCode.trim()) return setError("请填写产品分类。");
    if (!Number.isSafeInteger(quantity) || quantity < 1) return setError("目标支持数量必须是正整数。");
    if (!riskSummary.trim()) return setError("请如实填写风险说明。");
    if (publishNow && (!evidenceTitle.trim() || !evidenceSummary.trim())) return setError("发布前至少填写一项核验依据。");
    if (publishNow && (!Number.isSafeInteger(days) || days < 1 || days > 365)) return setError("征集周期应为 1 至 365 天。");

    const operation = `create-${sourceType}-${sourceId}`;
    try {
      const created = await createMutation.mutateAsync({
        sourceType: sourceType as FundingSourceType,
        sourceId,
        title: title.trim(),
        summary: summary.trim(),
        description: description.trim(),
        categoryCode: categoryCode.trim(),
        goalQuantity: quantity,
        evidence: evidenceTitle.trim() && evidenceSummary.trim() ? [{
          type: sourceType === "need" ? "need" : "prototype",
          title: evidenceTitle.trim(),
          summary: evidenceSummary.trim(),
          sourceUrl: evidenceUrl.trim() || undefined,
        }] : undefined,
        verificationSummary: verificationSummary.trim() || undefined,
        riskSummary: riskSummary.trim(),
        startsAt: publishNow ? new Date() : undefined,
        endsAt: publishNow ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : undefined,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      let campaign = created.campaign;
      if (publishNow) {
        const publishOperation = `publish-${campaign.id}`;
        const published = await publishMutation.mutateAsync({
          campaignId: campaign.id,
          expectedAuthorizationVersion: campaign.authorizationVersion,
          requestId: requests.get(publishOperation),
        });
        requests.complete(publishOperation);
        campaign = published.campaign;
      }
      await Promise.all([
        utils.fundingCampaigns.publicList.invalidate(),
        utils.fundingCampaigns.myList.invalidate(),
      ]);
      setError("");
      router.replace(publishNow ? `/funding/${campaign.publicCode}` as never : "/funding/mine" as never);
    } catch (cause) {
      setError(fundingErrorMessage(cause));
    }
  };

  if (needs.isLoading || ideas.isLoading) return <LoadingView text="正在加载可用来源…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-base font-bold text-foreground">筹措不是支付</Text>
          <Text className="text-sm text-muted leading-6 mt-2">支持者登记数量意向，平台据此验证真实需求。页面不会收款，也不会生成虚假销量。</Text>
        </View>

        <FieldLabel label="来源类型" required />
        <View className="flex-row gap-2 mb-3">
          {(["need", "idea"] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => { setSourceType(type); setSourceId(null); }}
              className={sourceType === type ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}
            >
              <Text className={sourceType === type ? "text-white font-semibold" : "text-foreground"}>{FUNDING_SOURCE_LABELS[type]}</Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel label={`选择我的${FUNDING_SOURCE_LABELS[sourceType]}`} required />
        {sourceOptions.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
            <Text className="text-sm text-muted">暂无可用来源，请先发布{FUNDING_SOURCE_LABELS[sourceType]}。</Text>
            <View className="mt-3"><PrimaryButton title={`去发布${FUNDING_SOURCE_LABELS[sourceType]}`} variant="outline" onPress={() => router.push(sourceType === "need" ? "/needs/create" as never : "/ideas/edit" as never)} /></View>
          </View>
        ) : (
          <View className="mb-4">
            {sourceOptions.map((option) => (
              <Pressable key={`${option.type}-${option.id}`} onPress={() => selectSource(option)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
                <View className={sourceId === option.id ? "bg-primary/10 border border-primary rounded-2xl p-4 mb-2" : "bg-surface border border-border rounded-2xl p-4 mb-2"}>
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-base font-semibold text-foreground flex-1" numberOfLines={1}>{option.title}</Text>
                    <StatusBadge label={option.status} tone="gray" small />
                  </View>
                  <Text className="text-sm text-muted mt-2" numberOfLines={2}>{option.summary}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {selectedSource ? <Text className="text-xs text-primary mb-3">已选择：{selectedSource.title}</Text> : null}
        <FieldLabel label="活动标题" required />
        <AppTextInput value={title} onChangeText={setTitle} placeholder="说明准备验证的新品" />
        <FieldLabel label="一句话简介" required />
        <AppTextInput value={summary} onChangeText={setSummary} placeholder="说明解决什么问题、面向谁" multiline />
        <FieldLabel label="详细说明" required />
        <AppTextInput value={description} onChangeText={setDescription} placeholder="说明方案、当前进度、交付边界和验证方式" multiline />
        <FieldLabel label="产品分类" required />
        <AppTextInput value={categoryCode} onChangeText={setCategoryCode} placeholder="如：家居工具" />
        <FieldLabel label="目标支持数量" required />
        <AppTextInput value={goalQuantity} onChangeText={setGoalQuantity} keyboardType="numeric" placeholder="如：100" />
        <FieldLabel label="意向征集天数" required />
        <AppTextInput value={durationDays} onChangeText={setDurationDays} keyboardType="numeric" placeholder="如：30" />

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">可核验依据</Text>
          <Text className="text-xs text-muted mt-1">发布前必填；公开页只展示你主动提交的最小必要信息。</Text>
          <FieldLabel label="依据标题" />
          <AppTextInput value={evidenceTitle} onChangeText={setEvidenceTitle} placeholder="如：同类需求支持记录" />
          <FieldLabel label="依据摘要" />
          <AppTextInput value={evidenceSummary} onChangeText={setEvidenceSummary} placeholder="说明样本、结论和限制" multiline />
          <FieldLabel label="公开链接（可选）" />
          <AppTextInput value={evidenceUrl} onChangeText={setEvidenceUrl} autoCapitalize="none" placeholder="https://" />
          <FieldLabel label="核验结论（可选）" />
          <AppTextInput value={verificationSummary} onChangeText={setVerificationSummary} placeholder="平台或项目团队的核验说明" multiline />
        </View>

        <FieldLabel label="风险说明" required />
        <AppTextInput value={riskSummary} onChangeText={setRiskSummary} placeholder="说明尚未解决的问题、时间和交付风险" multiline />

        {error ? <Text className="text-sm text-error mt-4">{error}</Text> : null}
        <View className="flex-row gap-3 mt-5">
          <View className="flex-1"><PrimaryButton title="保存草稿" variant="outline" disabled={busy} loading={createMutation.isPending && !publishMutation.isPending} onPress={() => submit(false)} /></View>
          <View className="flex-1"><PrimaryButton title="创建并发布" disabled={busy} loading={busy} onPress={() => submit(true)} /></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function NewFundingCampaignScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="发起新品筹措" />
      <AuthGate title="登录后发起新品筹措"><NewFundingCampaignContent /></AuthGate>
    </ScreenContainer>
  );
}
