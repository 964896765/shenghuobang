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
  PRODUCT_UNIT_STATUS_LABELS,
  type ProductPassportVisibility,
  type ProductUnitStatus,
} from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

function statusTone(status: ProductUnitStatus): "gray" | "blue" | "green" | "orange" {
  if (["in_use", "manufactured", "registered"].includes(status)) return "green";
  if (["listed", "under_service", "recycling"].includes(status)) return "blue";
  if (["recycled", "retired"].includes(status)) return "orange";
  return "gray";
}

function InternalPassportContent({ unitId }: { unitId: number }) {
  const router = useRouter();
  const passport = trpc.productUnits.internalDetail.useQuery({ productUnitId: unitId });
  if (passport.isLoading) return <LoadingView text="正在读取内部产品护照…" />;
  if (passport.isError || !passport.data) return <ErrorState title="无法读取内部护照" hint={productErrorMessage(passport.error)} onRetry={() => void passport.refetch()} />;

  const { model, unit, events, integrity } = passport.data;
  const status = unit.status as ProductUnitStatus;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={passport.isRefetching} onRefresh={() => void passport.refetch()} />} contentContainerStyle={{ padding: 16, paddingBottom: 52 }}>
      <View className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-center justify-between gap-3"><StatusBadge label={PRODUCT_UNIT_STATUS_LABELS[status]} tone={statusTone(status)} /><Text className="text-xs text-muted">内部视图</Text></View>
        <Text className="text-2xl font-bold text-foreground mt-4">{model.name}</Text>
        <Text className="text-sm text-muted mt-2">单件 ID：{unit.id} · 公开码：{unit.publicCode}</Text>
        <Text className="text-sm text-muted mt-1">序列号：{unit.serialNumber ?? "未填写"} · 批次：{unit.batchCode ?? "未填写"}</Text>
        <Text className="text-sm text-muted mt-1">当前所有者账号：{unit.currentOwnerAccountId} · 关联物品：{unit.linkedItemId ?? "未关联"}</Text>
        <View className="mt-4"><PrimaryButton title="返回本人护照" variant="outline" onPress={() => router.push(`/products/passport/owner/${unitId}` as never)} /></View>
      </View>

      <View className={`border rounded-2xl p-4 mt-4 ${integrity.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        <Text className={`text-base font-bold ${integrity.verified ? "text-green-800" : "text-red-800"}`}>{integrity.verified ? "内部护照哈希链完整" : "内部护照哈希链异常"}</Text>
        <Text className={`text-sm mt-2 ${integrity.verified ? "text-green-700" : "text-red-700"}`}>{productIntegrityLabel(integrity)}。此页依据服务端能力授权显示完整事件，不可作为公开页面替代。</Text>
      </View>

      <Text className="text-lg font-bold text-foreground mt-6 mb-3">完整可审计事件链</Text>
      {events.length === 0 ? <EmptyState title="暂无护照事件" hint="产品单件登记后会自动写入首条事件。" /> : events.map((event) => {
        const fromStatus = event.fromStatus as ProductUnitStatus | null;
        const toStatus = event.toStatus as ProductUnitStatus | null;
        const visibility = event.visibility as ProductPassportVisibility;
        return (
          <View key={`${event.sequenceNumber}-${event.eventHash}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between gap-3"><Text className="text-base font-bold text-foreground">#{event.sequenceNumber} {productEventLabel(event.eventType)}</Text><Text className="text-xs text-muted">{formatProductDate(event.occurredAt, true)}</Text></View>
            <Text className="text-xs text-primary mt-2">范围：{PRODUCT_PASSPORT_VISIBILITY_LABELS[visibility]} · 执行账号：{event.actorAccountId}</Text>
            {event.actorOrganizationId ? <Text className="text-xs text-muted mt-1">执行组织：{event.actorOrganizationId}</Text> : null}
            {fromStatus || toStatus ? <Text className="text-sm text-primary font-semibold mt-2">{fromStatus ? PRODUCT_UNIT_STATUS_LABELS[fromStatus] : "—"} → {toStatus ? PRODUCT_UNIT_STATUS_LABELS[toStatus] : "—"}</Text> : null}
            <Text className="text-sm text-muted leading-6 mt-2">{describeProductEventDetail(event.detail)}</Text>
            {(event.sourceType || event.sourceId) ? <Text className="text-xs text-muted mt-2">来源：{event.sourceType ?? "—"} · {event.sourceId ?? "—"}</Text> : null}
            <Text className="text-xs text-muted mt-2" numberOfLines={1}>前序哈希：{event.previousEventHash ?? "GENESIS"}</Text>
            <Text className="text-xs text-muted mt-1" numberOfLines={1}>事件哈希：{event.eventHash}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function InternalProductPassportScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const unitId = Number(params.id);
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="内部产品护照" />{Number.isSafeInteger(unitId) && unitId > 0 ? <AuthGate title="登录后查看内部护照"><InternalPassportContent unitId={unitId} /></AuthGate> : <ErrorState title="产品单件参数无效" />}</ScreenContainer>;
}
