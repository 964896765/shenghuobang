import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ErrorState, FieldLabel, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage, StableProductRequestIds } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

const EVENT_VISIBILITIES = [["public", "公开"], ["owner", "仅所有者"], ["internal", "内部"]] as const;
const RECOMMENDED_EVENT_TYPES = [
  ["maintenance_recorded", "维修记录"],
  ["inspection_recorded", "质检记录"],
  ["ownership_transferred", "所有权转移说明"],
  ["recycling_started", "开始回收"],
  ["recycled", "回收完成"],
] as const;

function parseDetail(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("补充信息必须是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

function AppendPassportContent({ unitId }: { unitId: number }) {
  const router = useRouter();
  const requests = useRef(new StableProductRequestIds()).current;
  const passport = trpc.productUnits.detail.useQuery({ productUnitId: unitId });
  const append = trpc.productUnits.appendPassport.useMutation();
  const [eventType, setEventType] = useState("maintenance_recorded");
  const [visibility, setVisibility] = useState<"public" | "owner" | "internal">("owner");
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [detailJson, setDetailJson] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const unit = passport.data?.unit;
    if (!unit) return;
    try {
      const normalizedType = eventType.trim();
      if (!normalizedType) throw new Error("请填写事件类型。");
      const operation = `append-${unitId}-${normalizedType}`;
      await append.mutateAsync({
        productUnitId: unitId,
        eventType: normalizedType,
        visibility,
        sourceType: sourceType.trim() || undefined,
        sourceId: sourceId.trim() || undefined,
        detail: parseDetail(detailJson),
        expectedAuthorizationVersion: unit.authorizationVersion,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      router.replace(`/products/passport/owner/${unitId}` as never);
    } catch (cause) {
      setError(cause instanceof Error && /JSON|事件类型/.test(cause.message) ? cause.message : productErrorMessage(cause));
    }
  };

  if (passport.isLoading) return <LoadingView text="正在读取产品单件…" />;
  if (passport.isError || !passport.data) return <ErrorState title="无法读取产品单件" hint={productErrorMessage(passport.error)} onRetry={() => void passport.refetch()} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4"><Text className="text-base font-bold text-foreground">追加不可静默覆盖的产品事件</Text><Text className="text-sm text-muted leading-6 mt-2">已写入事件不可在客户端删除或覆盖；若有更正，应追加新的说明事件，完整性校验会验证整个哈希链。</Text></View>
        <FieldLabel label="事件类型" required />
        <View className="flex-row flex-wrap gap-2 mb-3">{RECOMMENDED_EVENT_TYPES.map(([value, label]) => <Pressable key={value} onPress={() => setEventType(value)} className={eventType === value ? "bg-primary rounded-full px-3 py-2" : "bg-surface border border-border rounded-full px-3 py-2"}><Text className={eventType === value ? "text-white text-sm font-semibold" : "text-foreground text-sm"}>{label}</Text></Pressable>)}</View>
        <AppTextInput value={eventType} onChangeText={setEventType} placeholder="或填写自定义事件类型，如 installation_recorded" autoCapitalize="none" />
        <FieldLabel label="可见范围" required />
        <View className="flex-row flex-wrap gap-2 mb-4">{EVENT_VISIBILITIES.map(([value, label]) => <Pressable key={value} onPress={() => setVisibility(value)} className={visibility === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}><Text className={visibility === value ? "text-white font-semibold" : "text-foreground"}>{label}</Text></Pressable>)}</View>
        <FieldLabel label="来源类型（可选）" /><AppTextInput value={sourceType} onChangeText={setSourceType} placeholder="如：repair_order、inspection" autoCapitalize="none" />
        <FieldLabel label="来源标识（可选）" /><AppTextInput value={sourceId} onChangeText={setSourceId} placeholder="对应的外部或业务来源编号" autoCapitalize="none" />
        <FieldLabel label="事件详情 JSON（可选）" /><AppTextInput value={detailJson} onChangeText={setDetailJson} placeholder='例如：{"服务商":"认证维修点","结果":"更换滤芯"}' multiline autoCapitalize="none" />
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        <View className="mt-5"><PrimaryButton title="追加护照事件" loading={append.isPending} disabled={append.isPending} onPress={() => void submit()} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function AppendProductPassportEventScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const unitId = Number(params.id);
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="追加护照事件" />{Number.isSafeInteger(unitId) && unitId > 0 ? <AuthGate title="登录后追加护照事件"><AppendPassportContent unitId={unitId} /></AuthGate> : <ErrorState title="产品单件参数无效" />}</ScreenContainer>;
}
