import { useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { startLogin } from "@/constants/app";
import {
  FUNDING_SOURCE_LABELS,
  FUNDING_STATUS_LABELS,
  StableFundingRequestIds,
  formatFundingDate,
  fundingErrorMessage,
  fundingProgress,
  type FundingCampaignStatus,
  type FundingSourceType,
} from "@/lib/funding-app";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";

type EvidenceItem = {
  type: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  verifiedAt?: Date | string;
};

const EVENT_LABELS: Record<string, string> = {
  campaign_created: "创建活动草稿",
  campaign_updated: "更新活动信息",
  campaign_published: "公开征集支持意向",
  pledge_registered: "新增支持意向",
  pledge_withdrawn: "撤回支持意向",
  campaign_closed: "活动结束",
};

function statusTone(status: FundingCampaignStatus): "gray" | "blue" | "green" | "orange" {
  if (status === "succeeded") return "green";
  if (status === "active") return "blue";
  if (status === "failed" || status === "cancelled") return "orange";
  return "gray";
}

function evidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.summary !== "string") return [];
    return [{
      type: typeof row.type === "string" ? row.type : "other",
      title: row.title,
      summary: row.summary,
      sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : undefined,
      verifiedAt: row.verifiedAt instanceof Date || typeof row.verifiedAt === "string" ? row.verifiedAt : undefined,
    }];
  });
}

function eventSummary(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const row = detail as Record<string, unknown>;
  const pieces: string[] = [];
  if (typeof row.quantity === "number") pieces.push(`本次 ${row.quantity} 份`);
  if (typeof row.pledgedQuantity === "number") pieces.push(`累计 ${row.pledgedQuantity} 份`);
  if (typeof row.activePledgeCount === "number") pieces.push(`${row.activePledgeCount} 位支持者`);
  if (typeof row.reason === "string" && row.reason.trim()) pieces.push(row.reason.trim());
  return pieces.length ? pieces.join(" · ") : null;
}

export default function FundingCampaignDetailScreen() {
  const router = useRouter();
  const { publicCode: rawCode } = useLocalSearchParams<{ publicCode: string }>();
  const publicCode = typeof rawCode === "string" ? rawCode.trim() : "";
  const { isAuthenticated } = useRole();
  const requests = useRef(new StableFundingRequestIds()).current;
  const utils = trpc.useUtils();
  const detail = trpc.fundingCampaigns.publicDetail.useQuery({ publicCode }, { enabled: Boolean(publicCode) });
  const timeline = trpc.fundingCampaigns.publicTimeline.useQuery({ publicCode }, { enabled: Boolean(publicCode) });
  const registerMutation = trpc.fundingPledges.register.useMutation();
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [cityName, setCityName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = async () => {
    await Promise.all([detail.refetch(), timeline.refetch()]);
  };

  const register = async () => {
    if (!isAuthenticated) return startLogin();
    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 1000) {
      setError("支持数量应为 1 至 1000 的整数。");
      return;
    }
    const operation = `pledge-${publicCode}`;
    try {
      const result = await registerMutation.mutateAsync({
        publicCode,
        quantity: parsedQuantity,
        note: note.trim() || undefined,
        cityName: cityName.trim() || undefined,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      setError("");
      setSuccess(result.duplicate ? "该支持意向已经登记，无需重复提交。" : "支持意向已登记；本次不会扣款。你可以在“我的筹措”中撤回。 ");
      await Promise.all([
        utils.fundingCampaigns.publicDetail.invalidate({ publicCode }),
        utils.fundingCampaigns.publicTimeline.invalidate({ publicCode }),
        utils.fundingCampaigns.publicList.invalidate(),
        utils.fundingPledges.myList.invalidate(),
      ]);
    } catch (cause) {
      setSuccess("");
      setError(fundingErrorMessage(cause));
    }
  };

  if (!publicCode) {
    return (
      <ScreenContainer><PageHeader title="新品筹措" /><EmptyState title="筹措活动不存在" /></ScreenContainer>
    );
  }
  if (detail.isLoading) {
    return (
      <ScreenContainer><PageHeader title="新品筹措" /><LoadingView text="正在加载活动详情…" /></ScreenContainer>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <ScreenContainer>
        <PageHeader title="新品筹措" />
        <ErrorState title="无法查看筹措活动" hint={fundingErrorMessage(detail.error)} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const campaign = detail.data;
  const status = campaign.status as FundingCampaignStatus;
  const sourceType = campaign.sourceType as FundingSourceType;
  const progress = fundingProgress(campaign.pledgedQuantity, campaign.goalQuantity);
  const evidence = evidenceItems(campaign.evidence);
  const open = status === "active" && Boolean(campaign.endsAt) && new Date(campaign.endsAt as Date | string).getTime() > Date.now();

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="新品筹措" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={detail.isRefetching || timeline.isRefetching} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
      >
        <View className="bg-surface border border-border rounded-2xl p-4">
          <View className="flex-row items-center justify-between gap-3">
            <StatusBadge label={FUNDING_STATUS_LABELS[status]} tone={statusTone(status)} />
            <Text className="text-xs text-muted">来源：{FUNDING_SOURCE_LABELS[sourceType]}</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mt-3">{campaign.title}</Text>
          <Text className="text-base text-muted leading-7 mt-3">{campaign.summary}</Text>
          <Text className="text-sm text-foreground leading-6 mt-4">{campaign.description}</Text>
          <View className="h-2 bg-border rounded-full overflow-hidden mt-5">
            <View className="h-2 bg-primary rounded-full" style={{ width: `${progress}%` }} />
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-base font-bold text-foreground">{campaign.pledgedQuantity} / {campaign.goalQuantity} 份</Text>
            <Text className="text-base font-bold text-primary">{progress}%</Text>
          </View>
          <Text className="text-xs text-muted mt-2">{campaign.activePledgeCount} 位支持者 · 截止 {formatFundingDate(campaign.endsAt)}</Text>
        </View>

        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mt-4">
          <Text className="text-sm font-bold text-foreground">重要说明</Text>
          <Text className="text-sm text-muted leading-6 mt-2">{campaign.disclaimer}</Text>
        </View>

        <Text className="text-lg font-bold text-foreground mt-6 mb-3">可核验依据</Text>
        {evidence.length === 0 ? <EmptyState title="暂无公开依据" /> : evidence.map((item, index) => (
          <View key={`${item.title}-${index}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <Text className="text-base font-semibold text-foreground">{item.title}</Text>
            <Text className="text-sm text-muted leading-6 mt-2">{item.summary}</Text>
            {item.verifiedAt ? <Text className="text-xs text-muted mt-2">核验时间：{formatFundingDate(item.verifiedAt)}</Text> : null}
            {item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl) ? (
              <Pressable onPress={() => Linking.openURL(item.sourceUrl!)} className="mt-3"><Text className="text-sm text-primary font-semibold">查看公开来源</Text></Pressable>
            ) : null}
          </View>
        ))}
        {campaign.verificationSummary ? (
          <View className="bg-surface border border-border rounded-2xl p-4">
            <Text className="text-sm font-semibold text-foreground">核验结论</Text>
            <Text className="text-sm text-muted leading-6 mt-2">{campaign.verificationSummary}</Text>
          </View>
        ) : null}

        <Text className="text-lg font-bold text-foreground mt-6 mb-3">已知风险</Text>
        <View className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
          <Text className="text-sm text-foreground leading-6">{campaign.riskSummary}</Text>
        </View>

        <Text className="text-lg font-bold text-foreground mt-6 mb-3">公开进度</Text>
        {timeline.isLoading ? <LoadingView text="正在加载进度…" /> : (timeline.data ?? []).length === 0 ? (
          <EmptyState title="暂无进度记录" />
        ) : (timeline.data ?? []).map((event) => (
          <View key={event.sequenceNumber} className="flex-row mb-4">
            <View className="w-3 h-3 rounded-full bg-primary mt-1 mr-3" />
            <View className="flex-1 border-b border-border pb-4">
              <Text className="text-sm font-semibold text-foreground">{EVENT_LABELS[event.eventType] ?? event.eventType}</Text>
              <Text className="text-xs text-muted mt-1">{formatFundingDate(event.occurredAt)}</Text>
              {eventSummary(event.detail) ? <Text className="text-sm text-muted mt-2">{eventSummary(event.detail)}</Text> : null}
            </View>
          </View>
        ))}

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-lg font-bold text-foreground">登记支持意向</Text>
          <Text className="text-sm text-muted leading-6 mt-2">填写你可能需要的数量。平台只记录意向，不创建订单，不扣款。</Text>
          <FieldLabel label="预计需要数量" required />
          <AppTextInput value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="1" />
          <FieldLabel label="所在城市（可选）" />
          <AppTextInput value={cityName} onChangeText={setCityName} placeholder="用于判断地域需求" />
          <FieldLabel label="补充说明（可选）" />
          <AppTextInput value={note} onChangeText={setNote} placeholder="说明使用场景或关键要求" multiline />
          {success ? <Text className="text-sm text-success mt-3">{success}</Text> : null}
          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
          <View className="mt-4"><PrimaryButton title={open ? "登记支持意向" : "当前不接受新意向"} disabled={!open || registerMutation.isPending} loading={registerMutation.isPending} onPress={register} /></View>
          {isAuthenticated ? <View className="mt-3"><PrimaryButton title="查看我的筹措记录" variant="outline" onPress={() => router.push("/funding/mine" as never)} /></View> : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
