import { type ReactNode, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { type ContentCardData, ContentCard } from "@/components/content-card";
import { DiscoverCameraMenu } from "@/components/discover/discover-camera-menu";
import { DiscoverChannelBar } from "@/components/discover/discover-channel-bar";
import { DiscoverHeader } from "@/components/discover/discover-header";
import { DiscoverStateView } from "@/components/discover/discover-state-view";
import { ScreenContainer } from "@/components/screen-container";
import { startLogin } from "@/constants/app";
import { discoverErrorMessage } from "@/lib/discover";
import { useGlobalLocation } from "@/lib/location-context";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { DISCOVER_CHANNELS } from "@/shared/navigation/appNavigation";

type Channel = (typeof DISCOVER_CHANNELS)[number]["id"];

export default function DiscoverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = DISCOVER_CHANNELS.some((item) => item.id === params.tab) ? params.tab as Channel : "recommended";
  const [channel, setChannel] = useState<Channel>(initial);
  const [cameraMenuVisible, setCameraMenuVisible] = useState(false);
  const { isAuthenticated } = useRole();
  const location = useGlobalLocation();

  useEffect(() => {
    if (params.tab && DISCOVER_CHANNELS.some((item) => item.id === params.tab)) setChannel(params.tab as Channel);
  }, [params.tab]);

  const cityLabel = location.region ?? "选择城市";
  const content = trpc.content.discover.useQuery({
    channel,
    limit: 30,
    locationLabel: channel === "nearby" ? location.region ?? undefined : undefined,
  }, {
    enabled: (channel !== "following" || isAuthenticated) && (channel !== "nearby" || Boolean(location.region)),
  });

  const label = DISCOVER_CHANNELS.find((item) => item.id === channel)?.title ?? "发现";
  const contentErrorHint = useMemo(() => discoverErrorMessage(content.error), [content.error]);
  const rows = (content.data ?? []) as ContentCardData[];

  let contentState: ReactNode;
  if (channel === "following" && !isAuthenticated) {
    contentState = (
      <DiscoverStateView
        state="empty"
        title="登录后查看关注内容"
        hint="关注创作者、品牌或服务者后，这里会显示他们最新发布的公开内容。"
        actionTitle="登录"
        onAction={startLogin}
      />
    );
  } else if (channel === "nearby" && !location.region) {
    contentState = (
      <DiscoverStateView
        state="empty"
        title="先选择城市，再查看附近内容"
        hint="附近频道只读取全局城市，不会在发现页内再次申请定位权限。"
        actionTitle="选择位置"
        onAction={() => router.push("/location" as never)}
      />
    );
  } else if (content.isLoading) {
    contentState = <DiscoverStateView state="loading" text={`正在加载${label}频道...`} />;
  } else if (content.isError) {
    contentState = (
      <DiscoverStateView
        state="error"
        title={`${label}频道加载失败`}
        hint={contentErrorHint}
        onRetry={() => content.refetch()}
      />
    );
  } else {
    contentState = (
      <DiscoverStateView state="normal">
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.post.id)}
          renderItem={({ item }) => <ContentCard item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
          refreshControl={<RefreshControl refreshing={content.isRefetching} onRefresh={() => content.refetch()} />}
          ListEmptyComponent={(
            <DiscoverStateView
              state="empty"
              title={`${label}频道暂无内容`}
              hint={
                channel === "following"
                  ? "关注更多创作者后，这里会显示他们最新的公开内容。"
                  : channel === "nearby"
                    ? `当前城市 ${cityLabel} 暂无附近内容，可切换城市后重试。`
                    : channel === "needs"
                      ? "公开需求相关内容会优先展示在这里。"
                      : channel === "funding"
                        ? "新品筹措动态、进展和更新内容会显示在这里。"
                        : channel === "goods"
                          ? "与商品、产品和公开目录相关的内容会显示在这里。"
                          : channel === "services"
                            ? "服务案例、维修经验和服务知识会显示在这里。"
                            : "发布第一篇真实、有来源声明的内容。"
              }
              actionTitle={channel === "nearby" ? "选择位置" : "去创作"}
              onAction={() => router.push((channel === "nearby" ? "/location" : "/(tabs)/publish") as never)}
            />
          )}
        />
      </DiscoverStateView>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <DiscoverHeader
        cityLabel={cityLabel}
        onPressCity={() => router.push("/location" as never)}
        onPressSearch={() => router.push("/search" as never)}
        onPressCamera={() => setCameraMenuVisible(true)}
      />
      <DiscoverChannelBar channels={DISCOVER_CHANNELS} value={channel} onChange={setChannel} />
      <View className="flex-1">
        {contentState}
      </View>
      <DiscoverCameraMenu
        visible={cameraMenuVisible}
        onClose={() => setCameraMenuVisible(false)}
        onSearchByPhoto={() => router.push("/search" as never)}
        onScanPassport={() => router.push("/products/passport" as never)}
        onShootAndPublish={() => router.push("/(tabs)/publish" as never)}
      />
    </ScreenContainer>
  );
}
