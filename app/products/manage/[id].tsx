import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  formatProductDate,
  productErrorMessage,
  PRODUCT_MODEL_STATUS_LABELS,
  PRODUCT_UNIT_STATUS_LABELS,
  type ProductModelStatus,
  type ProductUnitStatus,
  StableProductRequestIds,
} from "@/lib/product-app";
import { trpc } from "@/lib/trpc";
import { useRef, useState } from "react";

function modelTone(status: ProductModelStatus): "gray" | "green" | "orange" {
  if (status === "active") return "green";
  if (status === "retired") return "orange";
  return "gray";
}

function unitTone(status: ProductUnitStatus): "gray" | "blue" | "green" | "orange" {
  if (["registered", "manufactured", "in_use"].includes(status)) return "green";
  if (["listed", "under_service", "recycling"].includes(status)) return "blue";
  if (["recycled", "retired"].includes(status)) return "orange";
  return "gray";
}

function ProductManageContent({ modelId }: { modelId: number }) {
  const router = useRouter();
  const requests = useRef(new StableProductRequestIds()).current;
  const utils = trpc.useUtils();
  const detail = trpc.productModels.detail.useQuery({ productModelId: modelId });
  const publish = trpc.productModels.publish.useMutation();
  const retire = trpc.productModels.retire.useMutation();
  const [error, setError] = useState("");

  const refresh = () => void detail.refetch();
  const runLifecycle = async (kind: "publish" | "retire") => {
    const model = detail.data?.model;
    if (!model) return;
    const operation = `${kind}-${model.id}`;
    try {
      const input = {
        productModelId: model.id,
        expectedAuthorizationVersion: model.authorizationVersion,
        requestId: requests.get(operation),
      };
      if (kind === "publish") await publish.mutateAsync(input);
      else await retire.mutateAsync(input);
      requests.complete(operation);
      await Promise.all([
        detail.refetch(),
        utils.productModels.myList.invalidate(),
        utils.productModels.publicList.invalidate(),
      ]);
      setError("");
    } catch (cause) {
      setError(productErrorMessage(cause));
    }
  };

  if (detail.isLoading) return <LoadingView text="正在加载产品型号…" />;
  if (detail.isError || !detail.data) return <ErrorState title="无法加载产品型号" hint={productErrorMessage(detail.error)} onRetry={refresh} />;

  const { model, sourceLinks, units } = detail.data;
  const status = model.status as ProductModelStatus;
  const busy = publish.isPending || retire.isPending;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} />} contentContainerStyle={{ padding: 16, paddingBottom: 56 }}>
      <View className="bg-surface border border-border rounded-2xl p-4">
        <View className="flex-row items-center justify-between gap-3"><StatusBadge label={PRODUCT_MODEL_STATUS_LABELS[status]} tone={modelTone(status)} /><Text className="text-xs text-muted">{model.publicCode}</Text></View>
        <Text className="text-xl font-bold text-foreground mt-3">{model.name}</Text>
        <Text className="text-sm text-muted leading-6 mt-2">{model.summary}</Text>
        {model.description ? <Text className="text-sm text-foreground leading-6 mt-3">{model.description}</Text> : null}
        <Text className="text-xs text-muted mt-3">分类：{model.categoryCode} · 版本：{model.versionLabel} · 可见范围：{model.visibility}</Text>
        <Text className="text-xs text-muted mt-1">创建于 {formatProductDate(model.createdAt, true)}</Text>
      </View>

      <View className="flex-row gap-3 mt-4">
        <View className="flex-1"><PrimaryButton title="登记产品单件" disabled={status === "retired"} onPress={() => router.push(`/products/manage/${model.id}/register` as never)} /></View>
        {model.visibility === "public" && status === "active" ? <View className="flex-1"><PrimaryButton title="查看公开页" variant="outline" onPress={() => router.push(`/products/${model.publicCode}` as never)} /></View> : null}
      </View>

      {status === "draft" ? <View className="mt-3"><PrimaryButton title="发布产品型号" disabled={busy} loading={publish.isPending} onPress={() => void runLifecycle("publish")} /></View> : null}
      {status === "active" ? <View className="mt-3"><PrimaryButton title="退役该产品型号" variant="outline" disabled={busy} loading={retire.isPending} onPress={() => void runLifecycle("retire")} /></View> : null}
      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      <Text className="text-lg font-bold text-foreground mt-7 mb-3">可信来源</Text>
      {sourceLinks.length === 0 ? <EmptyState title="暂无来源链" hint="该型号没有可展示来源；后续新增来源必须通过服务端授权。" /> : sourceLinks.map((source) => (
        <View key={source.id} className="bg-surface border border-border rounded-2xl p-4 mb-2"><Text className="text-sm font-semibold text-foreground">{source.relationType}</Text><Text className="text-sm text-muted mt-1">{source.sourceType} · #{source.sourceId}</Text></View>
      ))}

      <Text className="text-lg font-bold text-foreground mt-7 mb-3">产品单件与护照</Text>
      {units.length === 0 ? <EmptyState title="尚未登记产品单件" hint="型号不等于实体单件；登记后才能写入可验证的护照事件。" actionTitle="登记单件" onAction={() => router.push(`/products/manage/${model.id}/register` as never)} /> : units.map((unit) => {
        const unitStatus = unit.status as ProductUnitStatus;
        return (
          <View key={unit.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <View className="flex-row items-center justify-between gap-3"><StatusBadge label={PRODUCT_UNIT_STATUS_LABELS[unitStatus]} tone={unitTone(unitStatus)} /><Text className="text-xs text-muted">{unit.publicCode}</Text></View>
            <Text className="text-sm text-muted mt-3">信任等级：{unit.trustLevel} · 护照范围：{unit.passportVisibility}</Text>
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1"><PrimaryButton title="本人护照" small variant="outline" onPress={() => router.push(`/products/passport/owner/${unit.id}` as never)} /></View>
              <View className="flex-1"><PrimaryButton title="内部护照" small variant="outline" onPress={() => router.push(`/products/passport/internal/${unit.id}` as never)} /></View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function ProductManageScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const modelId = Number(params.id);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="管理产品型号" />
      {Number.isSafeInteger(modelId) && modelId > 0 ? <AuthGate title="登录后管理产品型号"><ProductManageContent modelId={modelId} /></AuthGate> : <ErrorState title="产品型号参数无效" />}
    </ScreenContainer>
  );
}
