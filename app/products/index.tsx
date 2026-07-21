import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

export default function ProductCatalogScreen() {
  const router = useRouter();
  const models = trpc.productModels.publicList.useQuery({ limit: 30 });

  if (models.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="可信产品" />
        <LoadingView text="正在加载产品目录…" />
      </ScreenContainer>
    );
  }

  if (models.isError) {
    return (
      <ScreenContainer>
        <PageHeader title="可信产品" />
        <ErrorState title="无法加载产品目录" hint={productErrorMessage(models.error)} onRetry={() => models.refetch()} />
      </ScreenContainer>
    );
  }

  const rows = models.data?.items ?? [];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="可信产品" />
      <ScrollView
        refreshControl={<RefreshControl refreshing={models.isRefetching} onRefresh={() => models.refetch()} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-lg font-bold text-foreground">从产品型号进入可信生命周期</Text>
          <Text className="text-sm text-muted leading-6 mt-2">
            公开目录只展示已发布型号及脱敏来源。每个实体产品拥有独立公开码和不可静默覆盖的护照事件链。
          </Text>
          <View className="mt-3 gap-2">
            <PrimaryButton title="查询单件产品护照" onPress={() => router.push("/products/passport" as never)} />
          </View>
        </View>

        {rows.length === 0 ? (
          <EmptyState title="暂无公开产品型号" hint="型号通过服务端发布门禁后会显示在这里。" />
        ) : rows.map((model) => (
          <Pressable
            key={model.publicCode}
            onPress={() => router.push(`/products/${model.publicCode}` as never)}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
            <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <StatusBadge label="已发布" tone="green" />
                <Text className="text-xs text-muted">{model.publicCode}</Text>
              </View>
              <Text className="text-lg font-bold text-foreground mt-3">{model.name}</Text>
              <Text className="text-sm text-muted leading-6 mt-2" numberOfLines={3}>{model.summary}</Text>
              <View className="flex-row flex-wrap gap-2 mt-3">
                <Text className="text-xs text-primary font-semibold">{model.categoryCode}</Text>
                {model.brandName ? <Text className="text-xs text-muted">品牌：{model.brandName}</Text> : null}
                <Text className="text-xs text-muted">版本：{model.versionLabel}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
