import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { ProductContentSections } from "@/components/product-content-sections";
import {
  describeProductEventDetail,
  formatProductDate,
  productErrorMessage,
  productEventLabel,
  productIntegrityLabel,
  PRODUCT_TRUST_LABELS,
  PRODUCT_UNIT_STATUS_LABELS,
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

export default function PublicProductPassportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ publicCode?: string | string[] }>();
  const publicCode = Array.isArray(params.publicCode) ? params.publicCode[0] : params.publicCode;
  const passport = trpc.productUnits.publicPassport.useQuery(
    { publicCode: publicCode ?? "" },
    { enabled: Boolean(publicCode) },
  );
  const relatedContent = trpc.content.relatedProduct.useQuery(
    { publicCode: publicCode ?? "", scope: "unit" },
    { enabled: Boolean(publicCode) },
  );

  if (!publicCode) {
    return (
      <ScreenContainer>
        <PageHeader title="产品护照" />
        <EmptyState title="产品码无效" hint="请重新输入产品单件公开码。" />
      </ScreenContainer>
    );
  }

  if (passport.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="产品护照" />
        <LoadingView text="正在验证产品护照…" />
      </ScreenContainer>
    );
  }

  if (passport.isError || !passport.data) {
    return (
      <ScreenContainer>
        <PageHeader title="产品护照" />
        <ErrorState title="无法读取公开护照" hint={productErrorMessage(passport.error)} onRetry={() => passport.refetch()} />
      </ScreenContainer>
    );
  }

  const { model, unit, events, integrity } = passport.data;
  const unitStatus = unit.status as ProductUnitStatus;
  const trustLevel = unit.trustLevel as ProductTrustLevel;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="产品护照" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={passport.isRefetching} onRefresh={() => passport.refetch()} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <View className="bg-surface border border-border rounded-2xl p-4">
          <View className="flex-row items-center justify-between gap-3">
            <StatusBadge label={PRODUCT_UNIT_STATUS_LABELS[unitStatus]} tone={statusTone(unitStatus)} />
            <Text className="text-xs text-muted">{unit.publicCode}</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mt-4">{model.name}</Text>
          <Text className="text-sm text-muted leading-6 mt-2">{model.summary}</Text>
          <View className="flex-row flex-wrap gap-2 mt-3">
            <Text className="text-xs text-primary font-semibold">{PRODUCT_TRUST_LABELS[trustLevel]}</Text>
            <Text className="text-xs text-muted">{model.categoryCode}</Text>
            {model.brandName ? <Text className="text-xs text-muted">{model.brandName}</Text> : null}
          </View>
          <View className="mt-4">
            <PrimaryButton title="查看产品型号" onPress={() => router.push(`/products/${model.publicCode}` as never)} />
          </View>
        </View>

        <View className={`border rounded-2xl p-4 mt-4 ${integrity.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <Text className={`text-base font-bold ${integrity.verified ? "text-green-800" : "text-red-800"}`}>
            {integrity.verified ? "护照完整性校验通过" : "护照完整性校验异常"}
          </Text>
          <Text className={`text-sm mt-2 ${integrity.verified ? "text-green-700" : "text-red-700"}`}>
            {productIntegrityLabel(integrity)}。公开展示 {events.length} 条事件，未公开事件仍参与完整哈希链校验。
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">单件信息</Text>
          <Text className="text-sm text-muted mt-2">生产时间：{formatProductDate(unit.manufacturedAt, true)}</Text>
          <Text className="text-sm text-muted mt-2">启用时间：{formatProductDate(unit.activatedAt, true)}</Text>
          <Text className="text-sm text-muted mt-2">最近更新：{formatProductDate(unit.updatedAt, true)}</Text>
        </View>

        <Text className="text-lg font-bold text-foreground mt-6 mb-3">公开生命周期事件</Text>
        {events.length === 0 ? (
          <EmptyState title="暂无公开事件" hint="该产品可能存在仅所有者或内部可见的事件。" />
        ) : events.map((event) => {
          const fromStatus = event.fromStatus as ProductUnitStatus | null;
          const toStatus = event.toStatus as ProductUnitStatus | null;
          return (
            <View key={`${event.sequenceNumber}-${event.eventHash}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base font-bold text-foreground">#{event.sequenceNumber} {productEventLabel(event.eventType)}</Text>
                <Text className="text-xs text-muted">{formatProductDate(event.occurredAt, true)}</Text>
              </View>
              {fromStatus || toStatus ? (
                <Text className="text-sm text-primary font-semibold mt-2">
                  {fromStatus ? PRODUCT_UNIT_STATUS_LABELS[fromStatus] : "—"} → {toStatus ? PRODUCT_UNIT_STATUS_LABELS[toStatus] : "—"}
                </Text>
              ) : null}
              <Text className="text-sm text-muted leading-6 mt-2">{describeProductEventDetail(event.detail)}</Text>
              <Text className="text-xs text-muted mt-3" numberOfLines={1}>事件哈希：{event.eventHash}</Text>
            </View>
          );
        })}

        <ProductContentSections
          data={relatedContent.data}
          loading={relatedContent.isLoading}
          error={relatedContent.error?.message}
          onRetry={() => { void relatedContent.refetch(); }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
