import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { NeedCard } from "@/components/cards";
import { EmptyState, ErrorState, LoadingView, PrimaryButton, SectionHeader } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { useGlobalLocation } from "@/lib/location-context";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";

export default function NeedsHubScreen() {
  const router = useRouter();
  const location = useGlobalLocation();
  const { isAuthenticated } = useRole();
  const plaza = trpc.needs.list.useQuery({ scope: "plaza", ...location.queryInput });
  const mine = trpc.needs.list.useQuery({ scope: "mine" }, { enabled: isAuthenticated });

  const latestNeeds = plaza.data ?? [];
  const nearbyNeeds = latestNeeds.slice(0, 4);
  const recommendedNeeds = latestNeeds.slice(0, 4);

  return (
    <ScreenContainer>
      <PageHeader title="需求大厅" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Text className="text-base font-semibold text-foreground">公开需求聚合页</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">
            这里统一查看推荐、附近、最新和我的需求；发布入口继续走正式需求表单，不复制第二套数据模型。
          </Text>
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <PrimaryButton title="发布需求" onPress={() => router.push("/needs/create" as never)} />
            </View>
            <View className="flex-1">
              <PrimaryButton title="我的需求" variant="outline" onPress={() => router.push("/my-needs" as never)} />
            </View>
          </View>
        </View>

        {plaza.isLoading ? <View className="mt-4"><LoadingView text="正在加载需求大厅…" /></View> : null}
        {plaza.isError ? <View className="mt-4"><ErrorState title="需求大厅加载失败" hint={plaza.error.message} onRetry={() => plaza.refetch()} /></View> : null}

        {!plaza.isLoading && !plaza.isError ? (
          <>
            <View className="mt-5">
              <SectionHeader title="推荐" />
              {recommendedNeeds.length
                ? recommendedNeeds.map((item) => <NeedCard key={`recommended-${item.id}`} need={item} />)
                : <EmptyState title="暂无推荐需求" hint="稍后再来，或先发布一条需求。" />}
            </View>

            <View className="mt-5">
              <SectionHeader title="附近" />
              {nearbyNeeds.length
                ? nearbyNeeds.map((item) => <NeedCard key={`nearby-${item.id}`} need={item} />)
                : <EmptyState title="附近暂无需求" hint="当前城市暂无带位置摘要的公开需求。" />}
            </View>

            <View className="mt-5">
              <SectionHeader title="最新" />
              {latestNeeds.length
                ? latestNeeds.map((item) => <NeedCard key={`latest-${item.id}`} need={item} />)
                : <EmptyState title="暂无公开需求" hint="登录后可以创建第一条真实需求。" />}
            </View>
          </>
        ) : null}

        <View className="mt-5">
          <SectionHeader title="我的" />
          {!isAuthenticated ? (
            <EmptyState title="登录后查看我的需求" hint="公开需求可直接浏览，我的草稿与管理入口仅对本人可见。" actionTitle="前往登录" onAction={() => router.push("/login" as never)} />
          ) : mine.isLoading ? (
            <LoadingView text="正在加载我的需求…" />
          ) : mine.isError ? (
            <ErrorState title="我的需求加载失败" hint={mine.error.message} onRetry={() => mine.refetch()} />
          ) : (mine.data ?? []).length ? (
            (mine.data ?? []).map((item) => <NeedCard key={`mine-${item.id}`} need={item} />)
          ) : (
            <EmptyState title="你还没有需求" hint="创建后会自动出现在这里，并继续通过 /my-needs 管理。" actionTitle="发布需求" onAction={() => router.push("/needs/create" as never)} />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
