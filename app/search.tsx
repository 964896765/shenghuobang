import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView, SectionHeader } from "@/components/common";
import { NeedCard, EngineerCard, ListingCard } from "@/components/cards";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ForegroundLocationCard } from "@/components/foreground-location-card";
import { useForegroundLocation } from "@/hooks/use-foreground-location";

const HOT_KEYWORDS = ["空调维修", "旧手机", "小程序开发", "家具回收", "水管漏水", "智能家居"];

export default function SearchScreen() {
  const router = useRouter();
  const colors = useColors();
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const location = useForegroundLocation();

  const enabled = keyword.trim().length > 0;
  const needs = trpc.needs.list.useQuery({ keyword, scope: "plaza", ...location.queryInput }, { enabled });
  const engineers = trpc.engineers.list.useQuery({ keyword, ...location.queryInput }, { enabled });
  const listings = trpc.listings.list.useQuery({ keyword, scope: "market", ...location.queryInput }, { enabled });

  const loading = enabled && (needs.isLoading || engineers.isLoading || listings.isLoading);
  const needList = needs.data ?? [];
  const engineerList = engineers.data ?? [];
  const listingList = listings.data ?? [];
  const noResult = enabled && !loading && needList.length === 0 && engineerList.length === 0 && listingList.length === 0;
  const queryError = needs.error ?? engineers.error ?? listings.error;

  const doSearch = (kw?: string) => {
    const k = (kw ?? input).trim();
    if (!k) return;
    if (kw) setInput(kw);
    setKeyword(k);
  };

  return (
    <ScreenContainer>
      <PageHeader title="搜索" />
      <View className="flex-row items-center gap-2 px-4 pb-2">
        <View className="flex-1 flex-row items-center bg-surface border border-border rounded-full px-3.5">
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            className="flex-1 py-2.5 px-2 text-[15px] text-foreground"
            placeholder="搜问题、工程师、服务或物品"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            returnKeyType="search"
            onSubmitEditing={() => doSearch()}
            autoFocus
          />
        </View>
        <Pressable onPress={() => doSearch()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Text className="text-primary font-medium text-[15px]">搜索</Text>
        </Pressable>
      </View>
      <ForegroundLocationCard compact controller={location} />

      {!enabled ? (
        <View className="px-4 pt-3">
          <Text className="text-sm font-semibold text-foreground mb-2">大家都在搜</Text>
          <View className="flex-row flex-wrap gap-2">
            {HOT_KEYWORDS.map((k) => (
              <Pressable key={k} onPress={() => doSearch(k)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className="bg-surface border border-border rounded-full px-3.5 py-1.5">
                  <Text className="text-sm text-foreground">{k}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : loading ? (
        <LoadingView />
      ) : queryError ? (
        <ErrorState title="搜索失败" hint={queryError.message} onRetry={() => { needs.refetch(); engineers.refetch(); listings.refetch(); }} />
      ) : noResult ? (
        <EmptyState
          title="没有找到相关内容"
          hint="换个关键词试试,或直接发布需求,平台会帮助寻找合适的人。"
          actionTitle="发布需求"
          onAction={() => router.push("/needs/create" as any)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {needList.length > 0 ? (
            <View>
              <SectionHeader title={`相关需求 ${needList.length}`} />
              {needList.slice(0, 5).map((n) => (
                <NeedCard key={n.id} need={n} />
              ))}
            </View>
          ) : null}
          {engineerList.length > 0 ? (
            <View>
              <SectionHeader title={`相关工程师 ${engineerList.length}`} />
              {engineerList.slice(0, 5).map((e) => (
                <EngineerCard key={e.userId} engineer={e} />
              ))}
            </View>
          ) : null}
          {listingList.length > 0 ? (
            <View>
              <SectionHeader title={`相关物品 ${listingList.length}`} />
              {listingList.slice(0, 5).map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
