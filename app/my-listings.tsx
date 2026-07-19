import React from "react";
import { FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView } from "@/components/common";
import { ListingCard } from "@/components/cards";

function MyListingsInner() {
  const router = useRouter();
  const listings = trpc.listings.list.useQuery({ scope: "mine" });

  if (listings.isLoading) return <LoadingView />;
  if (listings.isError) return <ErrorState title="无法加载我的发布" hint={listings.error.message} onRetry={() => listings.refetch()} />;

  return (
    <FlatList
      data={listings.data ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
      refreshControl={<RefreshControl refreshing={listings.isRefetching} onRefresh={() => listings.refetch()} />}
      ListEmptyComponent={
        <EmptyState
          title="还没有发布过物品"
          hint="把闲置物品发布出来,让它重新发挥价值。"
          actionTitle="发布物品"
          onAction={() => router.push("/listings/create" as any)}
        />
      }
      renderItem={({ item }) => <ListingCard listing={item} />}
    />
  );
}

export default function MyListingsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="我的物品" />
      <AuthGate title="登录后查看我的物品">
        <MyListingsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
