import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

type MarketplaceCatalogScreenProps = {
  title: string;
  heroTitle: string;
  heroDescription: string;
};

export function MarketplaceCatalogScreen({
  title,
  heroTitle,
  heroDescription,
}: MarketplaceCatalogScreenProps) {
  const router = useRouter();
  const models = trpc.productModels.publicList.useQuery({ limit: 30 });

  if (models.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title={title} />
        <LoadingView text="正在加载产品目录..." />
      </ScreenContainer>
    );
  }

  if (models.isError) {
    return (
      <ScreenContainer>
        <PageHeader title={title} />
        <ErrorState title="无法加载产品目录" hint={productErrorMessage(models.error)} onRetry={() => models.refetch()} />
      </ScreenContainer>
    );
  }

  const rows = models.data?.items ?? [];

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader
        title={title}
        right={(
          <Pressable onPress={() => router.push("/cart" as never)} className="px-2">
            <Text className="font-semibold text-primary">购物车</Text>
          </Pressable>
        )}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={models.isRefetching} onRefresh={() => models.refetch()} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <View className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 p-4">
          <Text className="text-lg font-bold text-foreground">{heroTitle}</Text>
          <Text className="mt-2 text-sm leading-6 text-muted">
            {heroDescription}
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
            <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between gap-3">
                <StatusBadge label="已发布" tone="green" />
                <Text className="text-xs text-muted">{model.publicCode}</Text>
              </View>
              <Text className="mt-3 text-lg font-bold text-foreground">{model.name}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted" numberOfLines={3}>{model.summary}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Text className="text-xs font-semibold text-primary">{model.categoryCode}</Text>
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
