import React from "react";
import { FlatList } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, LoadingView } from "@/components/common";
import { NeedCard } from "@/components/cards";

function MyNeedsInner() {
  const router = useRouter();
  const needs = trpc.needs.list.useQuery({ scope: "mine" });

  if (needs.isLoading) return <LoadingView />;

  return (
    <FlatList
      data={needs.data ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
      ListEmptyComponent={
        <EmptyState
          title="还没有发布过需求"
          hint="遇到生活问题，发布需求让专业的人帮你解决。"
          actionTitle="发布需求"
          onAction={() => router.push("/needs/create" as any)}
        />
      }
      renderItem={({ item }) => <NeedCard need={item} />}
    />
  );
}

export default function MyNeedsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的需求" />
      <AuthGate title="登录后查看我的需求">
        <MyNeedsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
