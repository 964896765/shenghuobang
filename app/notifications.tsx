import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingView } from "@/components/common";
import { formatTime } from "@/lib/labels";
import { dedupeNotifications } from "@/lib/message-display";
import { notificationRoute } from "@/lib/notification-navigation";
import { showFeedback } from "@/lib/feedback";

const CATEGORY_ICON: Record<string, string> = {
  order: "📦",
  project: "🔧",
  system: "📢",
  review: "⭐",
  credit: "🛡️",
};

function NotificationsInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const notifs = trpc.messagesRouter.notifications.useQuery();
  const markRead = trpc.messagesRouter.markRead.useMutation({
    onSuccess: () => {
      utils.messagesRouter.notifications.invalidate();
      utils.messagesRouter.unreadCount.invalidate();
    },
  });

  if (notifs.isLoading) return <LoadingView />;
  if (notifs.isError) return <ErrorState title="无法加载通知" hint={notifs.error.message} onRetry={() => notifs.refetch()} />;

  const data = dedupeNotifications(notifs.data ?? []);
  const hasUnread = data.some((n) => !n.isRead);

  const handlePress = (n: (typeof data)[0]) => {
    if (!n.isRead) markRead.mutate({ id: n.id });
    const route = notificationRoute(n.refType, n.refId);
    if (route) router.push(route as never);
    else showFeedback("通知已读", "这条通知没有可打开的页面，相关内容可能已结束或被删除。");
  };

  return (
    <View className="flex-1">
      {hasUnread ? (
        <View className="px-4 py-2 flex-row justify-end">
          <Pressable onPress={() => markRead.mutate({})} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Text className="text-sm text-primary">全部已读</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={notifs.isRefetching} onRefresh={() => notifs.refetch()} />}
        ListEmptyComponent={<EmptyState title="暂无通知" hint="订单、项目、系统消息等通知会显示在这里。" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => handlePress(item)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className={`flex-row items-start py-3.5 border-b border-border ${!item.isRead ? "bg-primary/5" : ""}`}>
              <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center mr-3 mt-0.5">
                <Text className="text-lg">{CATEGORY_ICON[item.category] ?? "🔔"}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-foreground flex-1 mr-2" numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.isRead ? <View className="w-2 h-2 rounded-full bg-primary" /> : null}
                </View>
                <Text className="text-sm text-muted mt-0.5 leading-5" numberOfLines={2}>
                  {item.content}
                </Text>
                <Text className="text-xs text-muted mt-1">{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

export default function NotificationsScreen() {
  return (
    <ScreenContainer>
      <PageHeader title="通知" />
      <AuthGate title="登录后查看通知">
        <NotificationsInner />
      </AuthGate>
    </ScreenContainer>
  );
}
