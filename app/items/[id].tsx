import React, { useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { PrimaryButton, EmptyState, LoadingView } from "@/components/common";
import { trpc } from "@/lib/trpc";

export default function ItemLifecycleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const query = trpc.items.lifecycle.useQuery({ id: itemId }, { enabled: Number.isFinite(itemId) });
  const utils = trpc.useUtils();
  const [description, setDescription] = useState("");
  const addService = trpc.items.addService.useMutation({ onSuccess: () => { setDescription(""); utils.items.lifecycle.invalidate({ id: itemId }); Alert.alert("已记录", "维修/保养记录已加入物品生命周期。"); } });
  if (query.isLoading) return <ScreenContainer><PageHeader title="物品生命周期" /><LoadingView /></ScreenContainer>;
  if (!query.data) return <ScreenContainer><PageHeader title="物品生命周期" /><EmptyState title="物品不存在" /></ScreenContainer>;
  const data=query.data;
  return <ScreenContainer><PageHeader title={data.item.title} /><AuthGate title="登录后查看物品档案"><ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }}>
    <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
      <Text className="text-lg font-bold text-foreground">{data.item.title}</Text>
      <Text className="text-sm text-muted mt-1">当前状态：{data.item.status} · {data.item.conditionLevel}</Text>
    </View>
    <Section title="历史发布" rows={data.listings.map((x) => `${x.createdAt.toLocaleDateString()} · ${x.primaryMode} · ${x.status}`)} />
    <Section title="所有权历史" rows={data.ownership.map((x) => `${x.transferredAt.toLocaleDateString()} · ${x.transferType}${x.orderId ? ` · 订单#${x.orderId}` : ""}`)} />
    <Section title="维修与服务" rows={data.services.map((x) => `${x.servicedAt.toLocaleDateString()} · ${x.serviceType} · ${x.description}`)} />
    <Section title="状态时间线" rows={data.statuses.map((x) => `${x.createdAt.toLocaleDateString()} · ${x.fromStatus ?? "新建"} → ${x.toStatus}${x.reason ? ` · ${x.reason}` : ""}`)} />
    <View className="bg-surface border border-border rounded-2xl p-4 mt-1">
      <Text className="text-base font-semibold text-foreground mb-2">添加维修/保养记录</Text>
      <TextInput value={description} onChangeText={setDescription} multiline placeholder="记录维修、更换零件或保养情况" className="border border-border rounded-xl px-3 py-3 text-foreground min-h-[90px]" />
      <View className="mt-3"><PrimaryButton title="保存记录" disabled={!description.trim()} loading={addService.isPending} onPress={() => addService.mutate({ itemId, serviceType:"repair", description:description.trim() })} /></View>
    </View>
  </ScrollView></AuthGate></ScreenContainer>;
}
function Section({ title, rows }: { title:string; rows:string[] }) {
  return <View className="bg-surface border border-border rounded-2xl p-4 mb-3"><Text className="text-base font-semibold text-foreground mb-2">{title}</Text>{rows.length ? rows.map((row,i)=><Text key={`${row}-${i}`} className="text-sm text-muted py-1.5">{row}</Text>) : <Text className="text-sm text-muted">暂无记录</Text>}</View>;
}
