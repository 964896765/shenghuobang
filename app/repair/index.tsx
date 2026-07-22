import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PageHeader } from "@/components/auth-gate";
import { ContentCard } from "@/components/content-card";
import { EngineerCard, NeedCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { useGlobalLocation } from "@/lib/location-context";
import { trpc } from "@/lib/trpc";

export default function RepairHubScreen() {
  const router = useRouter();
  const location = useGlobalLocation();
  const needs = trpc.needs.list.useQuery({ needType: "repair", ...location.queryInput });
  const engineers = trpc.engineers.list.useQuery(location.queryInput);
  const cases = trpc.content.discover.useQuery({ channel: "experience", limit: 20, locationLabel: location.region });
  const repairCases = (cases.data ?? []).filter((item) => item.post.contentType === "repair_case").slice(0, 4);
  const loading = needs.isLoading || engineers.isLoading || cases.isLoading;
  const failed = needs.isError || engineers.isError || cases.isError;

  return (
    <ScreenContainer>
      <PageHeader title="维修服务" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Text className="text-base font-bold text-foreground">{location.region || "当前位置"} · 诊断、服务匹配与案例</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">位置由首页统一入口提供，本页只按当前城市和距离展示。</Text>
          <View className="mt-3 flex-row gap-2">
            <View className="flex-1"><PrimaryButton title="发布维修需求" onPress={() => router.push("/needs/create?type=repair" as never)} /></View>
            <View className="flex-1"><PrimaryButton variant="outline" title="我的维修" onPress={() => router.push("/my-needs" as never)} /></View>
          </View>
        </View>
        {loading ? <LoadingView /> : failed ? <ErrorState title="维修服务加载失败" hint="请检查网络后重试" onRetry={() => { void needs.refetch(); void engineers.refetch(); void cases.refetch(); }} /> : (
          <>
            <Text className="mb-2 mt-5 text-lg font-bold text-foreground">附近服务者</Text>
            {(engineers.data ?? []).slice(0, 4).map((engineer) => <EngineerCard key={engineer.userId} engineer={engineer} />)}
            {!engineers.data?.length ? <EmptyState title="附近暂无可用服务者" hint="可以先发布维修需求，平台会持续匹配。" actionTitle="发布维修需求" onAction={() => router.push("/needs/create?type=repair" as never)} /> : null}
            <Text className="mb-2 mt-5 text-lg font-bold text-foreground">公开维修需求</Text>
            {(needs.data ?? []).slice(0, 4).map((need) => <NeedCard key={need.id} need={need} />)}
            <Text className="mb-2 mt-5 text-lg font-bold text-foreground">维修案例</Text>
            {repairCases.map((item) => <ContentCard key={item.post.id} item={item} />)}
            {!repairCases.length ? <EmptyState title="暂无维修案例" hint="服务者可发布真实维修案例供社区参考。" actionTitle="发布维修案例" onAction={() => router.push("/content/create?type=repair_case" as never)} /> : null}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
