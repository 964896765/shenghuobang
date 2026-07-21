import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { ProductContentSections } from "@/components/product-content-sections";
import { formatProductDate, productErrorMessage } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

function sourceLabel(sourceType: string): string {
  if (sourceType === "need") return "需求来源";
  if (sourceType === "idea") return "创意来源";
  return "产品来源";
}

export default function PublicProductDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ publicCode?: string | string[] }>();
  const publicCode = Array.isArray(params.publicCode) ? params.publicCode[0] : params.publicCode;
  const detail = trpc.productModels.publicDetail.useQuery(
    { publicCode: publicCode ?? "" },
    { enabled: Boolean(publicCode) },
  );
  const relatedContent = trpc.content.relatedProduct.useQuery(
    { publicCode: publicCode ?? "", scope: "model" },
    { enabled: Boolean(publicCode) },
  );
  const commerceListings = trpc.commerce.listingsForProduct.useQuery(
    { publicCode: publicCode ?? "" },
    { enabled: Boolean(publicCode) },
  );

  if (!publicCode) {
    return (
      <ScreenContainer>
        <PageHeader title="产品详情" />
        <EmptyState title="产品码无效" hint="请从产品目录重新进入。" />
      </ScreenContainer>
    );
  }

  if (detail.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="产品详情" />
        <LoadingView text="正在加载产品信息…" />
      </ScreenContainer>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ScreenContainer>
        <PageHeader title="产品详情" />
        <ErrorState title="无法读取产品详情" hint={productErrorMessage(detail.error)} onRetry={() => detail.refetch()} />
      </ScreenContainer>
    );
  }

  const { model, sourceLinks } = detail.data;
  const specificationText = model.specifications && typeof model.specifications === "object"
    ? JSON.stringify(model.specifications, null, 2)
    : "未公开规格参数";

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="产品详情" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => detail.refetch()} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <View className="bg-surface border border-border rounded-2xl p-4">
          <View className="flex-row items-center justify-between gap-3">
            <StatusBadge label="已发布" tone="green" />
            <Text className="text-xs text-muted">{model.publicCode}</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground mt-4">{model.name}</Text>
          <Text className="text-sm text-muted leading-6 mt-2">{model.summary}</Text>
          <View className="flex-row flex-wrap gap-2 mt-4">
            <Text className="text-xs text-primary font-semibold">{model.categoryCode}</Text>
            {model.brandName ? <Text className="text-xs text-muted">品牌：{model.brandName}</Text> : null}
            {model.modelCode ? <Text className="text-xs text-muted">型号：{model.modelCode}</Text> : null}
            <Text className="text-xs text-muted">版本：{model.versionLabel}</Text>
          </View>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">产品说明</Text>
          <Text className="text-sm text-muted leading-6 mt-2">{model.description || "暂无补充说明。"}</Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">公开规格</Text>
          <Text className="text-sm text-muted leading-6 mt-2">{specificationText}</Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">可核验来源</Text>
          {sourceLinks.length === 0 ? (
            <Text className="text-sm text-muted mt-2">暂无可公开的需求或创意来源。</Text>
          ) : sourceLinks.map((source) => (
            <Pressable
              key={`${source.sourceType}-${source.sourceId}-${source.relationType}`}
              onPress={() => router.push(source.sourceType === "need"
                ? `/needs/${source.sourceId}` as never
                : `/ideas/${source.sourceId}` as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View className="border border-border rounded-xl p-3 mt-2">
                <Text className="text-sm font-semibold text-foreground">{sourceLabel(source.sourceType)} #{source.sourceId}</Text>
                <Text className="text-xs text-muted mt-1">关系：{source.relationType}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mt-4">
          <Text className="text-base font-bold text-foreground">单件产品拥有独立护照</Text>
          <Text className="text-sm text-muted leading-6 mt-2">
            型号信息不等于单件追溯。请使用产品上的公开码查询生产、流转、维修和回收等公开事件。
          </Text>
          <View className="mt-3">
            <PrimaryButton title="查询单件产品护照" onPress={() => router.push("/products/passport" as never)} />
          </View>
        </View>

        <View className="mt-6">
          <View className="mb-3 flex-row items-center justify-between"><Text className="text-xl font-bold text-foreground">关联商品</Text><Pressable onPress={() => router.push("/cart" as never)}><Text className="text-sm font-semibold text-primary">购物车</Text></Pressable></View>
          {commerceListings.isLoading ? <LoadingView text="正在加载商品…" /> : commerceListings.isError ? <ErrorState title="商品加载失败" hint={commerceListings.error.message} onRetry={() => commerceListings.refetch()} /> : commerceListings.data?.length ? commerceListings.data.map(({ listing, sku }) => (
            <Pressable key={`${listing.id}-${sku.id}`} onPress={() => router.push(`/listings/${listing.id}` as never)} className="mb-3 rounded-2xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between"><StatusBadge label={`库存 ${sku.stock}`} tone="green" /><Text className="text-xs text-muted">{sku.skuCode}</Text></View>
              <Text className="mt-3 text-lg font-bold text-foreground">{sku.title}</Text>
              <Text className="mt-1 text-sm text-muted">{listing.title}</Text>
              <Text className="mt-2 text-xl font-bold text-action">¥{sku.price}</Text>
            </Pressable>
          )) : <EmptyState title="暂无关联商品" hint="产品型号已建立，但当前没有已上架且有库存的 SKU。" />}
        </View>

        <ProductContentSections
          data={relatedContent.data}
          loading={relatedContent.isLoading}
          error={relatedContent.error?.message}
          onRetry={() => { void relatedContent.refetch(); }}
        />

        <Text className="text-xs text-muted text-center mt-4">
          发布于 {formatProductDate(model.publishedAt)} · 最近更新 {formatProductDate(model.updatedAt)}
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
