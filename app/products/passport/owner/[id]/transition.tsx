import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ErrorState, FieldLabel, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage, PRODUCT_UNIT_STATUS_LABELS, StableProductRequestIds, type ProductUnitStatus } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

const UNIT_STATUSES: ProductUnitStatus[] = ["registered", "manufactured", "in_use", "idle", "listed", "under_service", "transferred", "recycling", "recycled", "retired"];
const EVENT_VISIBILITIES = [["public", "公开"], ["owner", "仅所有者"], ["internal", "内部"]] as const;

function parseDetail(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("补充信息必须是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

function TransitionContent({ unitId }: { unitId: number }) {
  const router = useRouter();
  const requests = useRef(new StableProductRequestIds()).current;
  const passport = trpc.productUnits.detail.useQuery({ productUnitId: unitId });
  const transition = trpc.productUnits.transition.useMutation();
  const [toStatus, setToStatus] = useState<ProductUnitStatus>("in_use");
  const [visibility, setVisibility] = useState<"public" | "owner" | "internal">("owner");
  const [nextOwnerAccountId, setNextOwnerAccountId] = useState("");
  const [detailJson, setDetailJson] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    const unit = passport.data?.unit;
    if (!unit) return;
    try {
      const nextOwner = nextOwnerAccountId.trim() ? Number(nextOwnerAccountId) : undefined;
      if (nextOwner !== undefined && (!Number.isSafeInteger(nextOwner) || nextOwner <= 0)) throw new Error("新所有者账号编号必须为正整数。");
      if (toStatus === "transferred" && !nextOwner) throw new Error("转移所有权时必须填写新所有者账号编号。");
      const operation = `transition-${unitId}-${toStatus}`;
      await transition.mutateAsync({
        productUnitId: unitId,
        toStatus,
        nextOwnerAccountId: nextOwner,
        visibility,
        detail: parseDetail(detailJson),
        expectedAuthorizationVersion: unit.authorizationVersion,
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      router.replace(`/products/passport/owner/${unitId}` as never);
    } catch (cause) {
      setError(cause instanceof Error && /JSON|所有者账号/.test(cause.message) ? cause.message : productErrorMessage(cause));
    }
  };

  if (passport.isLoading) return <LoadingView text="正在读取产品单件…" />;
  if (passport.isError || !passport.data) return <ErrorState title="无法读取产品单件" hint={productErrorMessage(passport.error)} onRetry={() => void passport.refetch()} />;
  const unit = passport.data.unit;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4"><Text className="text-base font-bold text-foreground">当前状态：{PRODUCT_UNIT_STATUS_LABELS[unit.status as ProductUnitStatus]}</Text><Text className="text-sm text-muted leading-6 mt-2">状态变化只通过服务端状态机写入，并同步追加一条不可静默覆盖的产品护照事件。</Text></View>
        <FieldLabel label="目标状态" required />
        <View className="flex-row flex-wrap gap-2 mb-4">
          {UNIT_STATUSES.map((status) => <Pressable key={status} onPress={() => setToStatus(status)} className={toStatus === status ? "bg-primary rounded-full px-3 py-2" : "bg-surface border border-border rounded-full px-3 py-2"}><Text className={toStatus === status ? "text-white text-sm font-semibold" : "text-foreground text-sm"}>{PRODUCT_UNIT_STATUS_LABELS[status]}</Text></Pressable>)}
        </View>
        {toStatus === "transferred" ? <><FieldLabel label="新所有者账号编号" required /><AppTextInput value={nextOwnerAccountId} onChangeText={setNextOwnerAccountId} placeholder="仅填写系统中的账号数字 ID" keyboardType="number-pad" /></> : null}
        <FieldLabel label="事件可见范围" required />
        <View className="flex-row flex-wrap gap-2 mb-4">{EVENT_VISIBILITIES.map(([value, label]) => <Pressable key={value} onPress={() => setVisibility(value)} className={visibility === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}><Text className={visibility === value ? "text-white font-semibold" : "text-foreground"}>{label}</Text></Pressable>)}</View>
        <FieldLabel label="变更说明 JSON（可选）" /><AppTextInput value={detailJson} onChangeText={setDetailJson} placeholder='例如：{"原因":"完成上门维修"}' multiline autoCapitalize="none" />
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        <View className="mt-5"><PrimaryButton title="确认变更并写入护照" loading={transition.isPending} disabled={transition.isPending} onPress={() => void submit()} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ProductUnitTransitionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const unitId = Number(params.id);
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="变更产品状态" />{Number.isSafeInteger(unitId) && unitId > 0 ? <AuthGate title="登录后变更产品状态"><TransitionContent unitId={unitId} /></AuthGate> : <ErrorState title="产品单件参数无效" />}</ScreenContainer>;
}
