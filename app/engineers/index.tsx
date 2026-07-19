import React, { useState } from "react";
import { FlatList, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EngineerCard } from "@/components/cards";
import { AppTextInput, EmptyState, LoadingView } from "@/components/common";
import { ForegroundLocationCard } from "@/components/foreground-location-card";
import { useForegroundLocation } from "@/hooks/use-foreground-location";

export default function EngineersScreen() {
  const [keyword, setKeyword] = useState("");
  const location = useForegroundLocation();
  const engineers = trpc.engineers.list.useQuery({ keyword: keyword || undefined, ...location.queryInput });

  return (
    <ScreenContainer>
      <PageHeader title="找工程师" />
      <View className="px-4 pb-2">
        <AppTextInput placeholder="搜索姓名、职业或技能" value={keyword} onChangeText={setKeyword} />
      </View>
      <ForegroundLocationCard compact controller={location} />
      {engineers.isLoading ? (
        <LoadingView />
      ) : (
        <FlatList
          data={engineers.data ?? []}
          keyExtractor={(i) => String(i.userId)}
          renderItem={({ item }) => <EngineerCard engineer={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
          ListEmptyComponent={<EmptyState title="暂无工程师" hint="附近的认证工程师会显示在这里。" />}
        />
      )}
    </ScreenContainer>
  );
}
