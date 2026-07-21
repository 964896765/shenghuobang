import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { startLogin } from "@/constants/app";
import { productErrorMessage, PRODUCT_UNIT_STATUS_LABELS, type ProductUnitStatus } from "@/lib/product-app";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";

type ProductWorkspaceTab = "models" | "units";

function modelStatusLabel(status: string): string {
  if (status === "active") return "已发布";
  if (status === "retired") return "已退役";
  return "草稿";
}

function modelStatusTone(status: string): "gray" | "blue" | "green" | "orange" {
  if (status === "active") return "green";
  if (status === "retired") return "orange";
  return "gray";
}

function unitStatusTone(status: ProductUnitStatus): "gray" | "blue" | "green" | "orange" {
  if (["registered", "manufactured", "in_use"].includes(status)) return "green";
  if (["listed", "under_service", "recycling"].includes(status)) return "blue";
  if (["recycled", "retired"].includes(status)) return "orange";
  return "gray";
}

export default function MyProductsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useRole();
  const [tab, setTab] = useState<ProductWorkspaceTab>("models");
  const models = trpc.productModels.myList.useQuery({ limit: 30 }, { enabled: isAuthenticated });
  const units = trpc.productUnits.listMine.useQuery({ limit: 30 }, { enabled: isAuthenticated });
  const isLoading = models.isLoading || units.isLoading;
  const isError = models.isError || units.isError;
  const error = models.error ?? units.error;
  const refreshing = models.isRefetching || units.isRefetching;
  const refresh = () => {
    void models.refetch();
    void units.refetch();
  };
  const modelRows = useMemo(() => models.data?.items ?? [], [models.data?.items]);
  const unitRows = useMemo(() => units.data?.items ?? [], [units.data?.items]);

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <PageHeader title="我的产品" />
        <EmptyState title="登录后管理产品护照" hint="你可以管理产品型号、登记单件身份并查看本人或内部追溯视图。" actionTitle="去登录" onAction={startLogin} />
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="我的产品" />
        <LoadingView text="正在加载产品工作台…" />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
        <PageHeader title="我的产品" />
        <ErrorState title="无法加载产品工作台" hint={productErrorMessage(error)} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="我的产品" />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-lg font-bold text-foreground">产品身份与护照工作台</Text>
          <Text className="text-sm text-muted leading-6 mt-2">型号、实体单件和护照事件均通过服务端授权与审计控制。公开页与内部页展示范围不同。</Text>
          <View className="mt-3">
            <PrimaryButton title="创建产品型号" onPress={() => router.push("/products/new" as never)} />
          </View>
        </View>

        <View className="flex-row bg-surface border border-border rounded-2xl p-1 mb-4">
          {(["models", "units"] as const).map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} className={`flex-1 rounded-xl px-3 py-3 ${tab === item ? "bg-primary" : ""}`}>
              <Text className={`text-center font-semibold ${tab === item ? "text-white" : "text-muted"}`}>{item === "models" ? `产品型号 (${modelRows.length})` : `产品单件 (${unitRows.length})`}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "models" ? (
          modelRows.length === 0 ? (
            <EmptyState title="尚未创建产品型号" hint="从需求、创意、项目或成功筹措活动出发，建立可追溯的产品型号。" actionTitle="创建型号" onAction={() => router.push("/products/new" as never)} />
          ) : modelRows.map((model) => (
            <Pressable key={model.id} onPress={() => router.push(`/products/manage/${model.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
              <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
                <View className="flex-row items-center justify-between gap-3">
                  <StatusBadge label={modelStatusLabel(model.status)} tone={modelStatusTone(model.status)} />
                  <Text className="text-xs text-muted">{model.publicCode}</Text>
                </View>
                <Text className="text-lg font-bold text-foreground mt-3">{model.name}</Text>
                <Text className="text-sm text-muted leading-6 mt-2" numberOfLines={2}>{model.summary}</Text>
                <Text className="text-xs text-muted mt-3">{model.categoryCode} · {model.versionLabel}</Text>
              </View>
            </Pressable>
          ))
        ) : (
          unitRows.length === 0 ? (
            <EmptyState title="尚未登记产品单件" hint="先创建或进入一个产品型号，再登记具备独立护照的实体单件。" />
          ) : unitRows.map(({ unit, model, relationship }) => {
            const status = unit.status as ProductUnitStatus;
            return (
              <Pressable key={unit.id} onPress={() => router.push(`/products/passport/owner/${unit.id}` as never)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
                <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <StatusBadge label={PRODUCT_UNIT_STATUS_LABELS[status]} tone={unitStatusTone(status)} />
                    <Text className="text-xs text-muted">{unit.publicCode}</Text>
                  </View>
                  <Text className="text-lg font-bold text-foreground mt-3">{model.name}</Text>
                  <Text className="text-sm text-muted mt-2">{relationship === "current_owner" ? "当前由我持有" : "我是型号维护方"}</Text>
                  <Text className="text-xs text-muted mt-3">信任等级：{unit.trustLevel} · 型号 {model.publicCode}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
