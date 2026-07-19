import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { ListingCard } from "@/components/cards";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

function CreateSwapInner() {
  const { targetListingId: rawId } = useLocalSearchParams<{ targetListingId: string }>();
  const targetListingId = Number(rawId);
  const router = useRouter();
  const target = trpc.listings.detail.useQuery({ id: targetListingId }, { enabled: Number.isFinite(targetListingId) });
  const mine = trpc.listings.list.useQuery({ scope: "mine" });
  const create = trpc.swaps.create.useMutation();
  const [selectedId, setSelectedId] = useState<number>();
  const [error, setError] = useState("");

  if (target.isLoading || mine.isLoading) return <LoadingView />;
  if (target.isError || mine.isError) {
    return <ErrorState title="无法发起置换" hint={target.error?.message ?? mine.error?.message} onRetry={() => { target.refetch(); mine.refetch(); }} />;
  }
  const targetListing = target.data?.listing;
  if (!targetListing || targetListing.status !== "published" || !(targetListing.modes ?? []).includes("swap")) {
    return <EmptyState title="该物品暂不支持置换" hint="物品可能已下架、进入其他交易或未开启置换方式。" />;
  }
  const options = (mine.data ?? []).filter((listing) => listing.id !== targetListingId && listing.status === "published" && (listing.modes ?? []).includes("swap"));

  const submit = async () => {
    if (!selectedId || create.isPending) return;
    try {
      setError("");
      const result = await create.mutateAsync({ targetListingId, offeredListingId: selectedId });
      router.replace(`/swaps/${result.id}` as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "置换请求提交失败，请重试");
    }
  };

  return (
    <View className="flex-1">
      <View className="px-4 pt-2">
        <Text className="text-sm font-semibold text-foreground mb-2">想要的物品</Text>
        <ListingCard listing={targetListing} />
        <Text className="text-sm font-semibold text-foreground mt-1 mb-2">选择用于交换的物品</Text>
      </View>
      <FlatList
        data={options}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListEmptyComponent={<EmptyState title="没有可用于置换的物品" hint="请先发布一件开启“置换”方式的物品。" actionTitle="发布置换物品" onAction={() => router.push("/listings/create?mode=swap" as never)} />}
        renderItem={({ item }) => (
          <View className={selectedId === item.id ? "rounded-2xl border-2 border-primary" : "rounded-2xl border-2 border-transparent"}>
            <ListingCard listing={item} onPress={() => setSelectedId(item.id)} />
          </View>
        )}
      />
      {options.length ? (
        <View className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-5 bg-background border-t border-border">
          {error ? <Text className="text-sm text-error mb-2">{error}</Text> : null}
          <PrimaryButton title="提交置换请求" onPress={submit} loading={create.isPending} disabled={!selectedId} />
        </View>
      ) : null}
    </View>
  );
}

export default function CreateSwapScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="发起置换" />
      <AuthGate title="登录后发起置换"><CreateSwapInner /></AuthGate>
    </ScreenContainer>
  );
}
