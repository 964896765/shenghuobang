import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView, StatusBadge } from "@/components/common";
import { ORDER_STATUS, formatTime } from "@/lib/labels";

const TYPE_LABEL: Record<string, string> = { listing: "旧物", project: "项目", recycling: "回收", swap: "置换" };

function OrdersInner() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "buyer" | "seller">("all");
  const orders = trpc.orders.list.useQuery();

  if (orders.isLoading) return <LoadingView />;
  if (orders.isError) return <ErrorState title="无法加载订单" hint={orders.error.message} onRetry={() => orders.refetch()} />;

  const data = (orders.data ?? []).filter((o) => (filter === "all" ? true : o.myRole === filter));

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-4 py-2">
        {(
          [
            { v: "all", l: "全部" },
            { v: "buyer", l: "我是买方" },
            { v: "seller", l: "我是卖方" },
          ] as const
        ).map((t) => (
          <Pressable key={t.v} onPress={() => setFilter(t.v)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className={filter === t.v ? "bg-primary rounded-full px-4 py-1.5" : "bg-surface border border-border rounded-full px-4 py-1.5"}>
              <Text className={filter === t.v ? "text-white text-sm" : "text-foreground text-sm"}>{t.l}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} />}
        ListEmptyComponent={<EmptyState title="暂无订单" hint="拍下物品、完成项目或选择回收商家后会生成订单。" />}
        renderItem={({ item }) => {
          const st = ORDER_STATUS[item.status] ?? { label: item.status, tone: "gray" as const };
          return (
            <Pressable onPress={() => router.push(`/orders/${item.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <View className="bg-surface rounded-2xl p-4 mb-3 border border-border">
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-2">
                    <View className="bg-accent/10 rounded px-1.5 py-0.5">
                      <Text className="text-[10px] text-accent">{TYPE_LABEL[item.orderType] ?? item.orderType}</Text>
                    </View>
                    <StatusBadge label={st.label} tone={st.tone} small />
                  </View>
                  <Text className="text-xs text-muted">{formatTime(item.createdAt)}</Text>
                </View>
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {item.title}
                </Text>
                <View className="flex-row items-center justify-between mt-1.5">
                  <Text className="text-sm text-action font-semibold">{item.orderType === "swap" ? "双方置换" : `¥${item.amount}`}</Text>
                  <Text className="text-xs text-muted">{item.myRole === "buyer" ? "我是买方" : "我是卖方"}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export default function OrdersScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的订单" />
      <AuthGate title="登录后查看订单">
        <OrdersInner />
      </AuthGate>
    </ScreenContainer>
  );
}
