import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  describeProductEventDetail,
  formatProductDate,
  productErrorMessage,
  productEventLabel,
  productIntegrityLabel,
  PRODUCT_PASSPORT_VISIBILITY_LABELS,
  PRODUCT_TRUST_LABELS,
  PRODUCT_UNIT_STATUS_LABELS,
  type ProductPassportVisibility,
  type ProductTrustLevel,
  type ProductUnitStatus,
} from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

function statusTone(status: ProductUnitStatus): "gray" | "blue" | "green" | "orange" {
  if (["in_use", "manufactured", "registered"].includes(status)) return "green";
  if (["listed", "under_service", "recycling"].includes(status)) return "blue";
  if (["recycled", "retired"].includes(status)) return "orange";
  return "gray";
}

function OwnerPassportContent({ unitId }: { unitId: number }) {
  const router = useRouter();
  const passport = trpc.productUnits.detail.useQuery({ productUnitId: unitId });
  if (passport.isLoading) return <LoadingView text="正在读取本人产品护照…" />;
  if (passport.isError || !passport.data) return <ErrorState title="无法读取本人护照" hint={productErrorMessage(passport.error)} onRetry={() => void passport.refetch()} />;

  const { model, unit, events, integrity } = passport.data;
  const unitStatus = unit.status as ProductUnitStatus;
  const trustLevel = unit.trustLevel as ProductTrustLevel;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={passport.isRefetching} onRefresh={() => void passport.refetch()} />} contentContainerStyle={{ padding: 16, paddingBottom: 52 }}>
      <View className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-center justify-between gap-3"><StatusBadge label={PRODUCT_UNIT_STATUS_LABELS[unitStatus]} tone={statusTone(unitStatus)} /><Text className="text-xs text-muted">{unit.publicCode}</Text></View>
        <Text className="text-2xl font-bold text-foreground mt-4">{model.name}</Text>
        <Text className="text-sm text-muted leading-6 mt-2">{model.summary}</Text>
        <Text className="text-xs text-muted mt-3">{PRODUCT_TRUST_LABELS[trustLevel]} · 本人视图展示公开及仅所有者事件</Text>
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1"><PrimaryButton title="变更状态" variant="outline" onPress={() => router.push(`/products/passport/owner/${unitId}/transition` as never)} /></View>
          <View className="flex-1"><PrimaryButton title="追加事件" variant="outline" onPress={() => router.push(`/products/passport/owner/${unitId}/append` as never)} /></View>
        </View>
        <View className="mt-3"><PrimaryButton title="内部护照视图" variant="outline" onPress={() => router.push(`/products/passport/internal/${unitId}` as never)} /></View>
      </View>

      <View className={`border rounded-2xl p-4 mt-4 ${integrity.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        <Text className={`text-base font-bold ${integrity.verified ? "text-green-800" : "text-red-800"}`}>{integrity.verified ? "护照完整性校验通过" : "护照完整性校验异常"}</Text>
        <Text className={`text-sm mt-2 ${integrity.verified ? "text-green-700" : "text-red-700"}`}>{productIntegrityLabel(integrity)}。本人可见事件 {events.length} 条；内部事件仍纳入完整性校验。</Text>
      </View>

      <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
        <Text className="text-base font-bold text-foreground">单件信息</Text>
        <Text className="text-sm text-muted mt-2">护照范围：{unit.passportVisibility}</Text>
        <Text className="text-sm text-muted mt-2">生产时间：{formatProductDate(unit.manufacturedAt, true)}</Text>
        <Text className="text-sm text-muted mt-2">启用时间：{formatProductDate(unit.activatedAt, true)}</Text>
        <Text className="text-sm text-muted mt-2">最后更新：{formatProductDate(unit.updatedAt, true)}</Text>
      </View>

      <Text className="text-lg font-bold text-foreground mt-6 mb-3">本人可见生命周期事件</Text>
      {events.length === 0 ? <EmptyState title="暂无可见事件" hint="可以从本页追加受限事件或变更实体单件状态。" /> : events.map((event) => {
        const fromStatus = event.fromStatus as ProductUnitStatus | null;
        const toStatus = event.toStatus as ProductUnitStatus | null;
        const visibility = event.visibility as ProductPassportVisibility;
        return (
          <View key={`${event.sequenceNumber}-${event.eventHash}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between gap-3"><Text className="text-base font-bold text-foreground">#{event.sequenceNumber} {productEventLabel(event.eventType)}</Text><Text className="text-xs text-muted">{formatProductDate(event.occurredAt, true)}</Text></View>
            <Text className="text-xs text-primary mt-2">可见范围：{PRODUCT_PASSPORT_VISIBILITY_LABELS[visibility]}</Text>
            {fromStatus || toStatus ? <Text className="text-sm text-primary font-semibold mt-2">{fromStatus ? PRODUCT_UNIT_STATUS_LABELS[fromStatus] : "—"} → {toStatus ? PRODUCT_UNIT_STATUS_LABELS[toStatus] : "—"}</Text> : null}
            <Text className="text-sm text-muted leading-6 mt-2">{describeProductEventDetail(event.detail)}</Text>
            <Text className="text-xs text-muted mt-3" numberOfLines={1}>事件哈希：{event.eventHash}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function OwnerProductPassportScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const unitId = Number(params.id);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="我的产品护照" />
      {Number.isSafeInteger(unitId) && unitId > 0 ? <AuthGate title="登录后查看本人护照"><OwnerPassportContent unitId={unitId} /></AuthGate> : <ErrorState title="产品单件参数无效" />}
    </ScreenContainer>
  );
}
