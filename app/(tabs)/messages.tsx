import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { Avatar, EmptyState, ErrorState, LoadingView } from "@/components/common";
import { formatTime } from "@/lib/labels";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { dedupeNotifications } from "@/lib/message-display";
import { notificationRoute } from "@/lib/notification-navigation";
import { showFeedback } from "@/lib/feedback";

const TABS = [
  { key: "chat", label: "聊天" },
  { key: "notice", label: "通知" },
] as const;

function MessagesInner() {
  const router = useRouter();
  const [tab, setTab] = useState<string>("chat");
  const conversations = trpc.messagesRouter.conversations.useQuery();
  const notifications = trpc.messagesRouter.notifications.useQuery();
  const utils = trpc.useUtils();
  const markRead = trpc.messagesRouter.markRead.useMutation({
    onSuccess: () => {
      utils.messagesRouter.notifications.invalidate();
      utils.messagesRouter.unreadCount.invalidate();
    },
  });
  const notificationData = dedupeNotifications(notifications.data ?? []);

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground">消息</Text>
        {tab === "notice" ? (
          <Pressable onPress={() => markRead.mutate({})} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text className="text-sm text-primary">全部已读</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row px-4 gap-2 pb-2">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <View className={t.key === tab ? "bg-primary rounded-full px-5 py-1.5" : "bg-surface border border-border rounded-full px-5 py-1.5"}>
              <Text className={t.key === tab ? "text-white text-sm font-medium" : "text-foreground text-sm"}>{t.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {tab === "chat" ? (
        conversations.isLoading ? (
          <LoadingView />
        ) : conversations.isError ? (
          <ErrorState title="无法加载会话" hint={conversations.error.message} onRetry={() => conversations.refetch()} />
        ) : (
          <FlatList
            data={conversations.data ?? []}
            keyExtractor={(i) => String(i.id)}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={conversations.isRefetching} onRefresh={() => conversations.refetch()} />}
            ListEmptyComponent={<EmptyState title="暂无聊天" hint="与工程师或买家沟通时,会话会显示在这里。" />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/chat/${item.id}` as any)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <View className="flex-row items-center px-4 py-3">
                  <Avatar name={item.otherNickname} size={46} />
                  <View className="flex-1 ml-3 border-b border-border pb-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-foreground">{item.otherNickname}</Text>
                      <Text className="text-xs text-muted">{formatTime(item.lastMessageAt)}</Text>
                    </View>
                    <Text className="text-sm text-muted mt-0.5" numberOfLines={1}>
                      {item.lastMessage ?? "开始聊天吧"}
                    </Text>
                  </View>
                  {item.unreadCount > 0 ? (
                    <View className="min-w-5 h-5 px-1.5 rounded-full bg-error items-center justify-center ml-2">
                      <Text className="text-[10px] text-white font-semibold">{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        )
      ) : notifications.isLoading ? (
        <LoadingView />
      ) : notifications.isError ? (
        <ErrorState title="无法加载通知" hint={notifications.error.message} onRetry={() => notifications.refetch()} />
      ) : (
        <FlatList
          data={notificationData}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={() => notifications.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无通知" hint="项目、订单、系统通知会显示在这里。" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (!item.isRead) markRead.mutate({ id: item.id });
                const route = notificationRoute(item.refType, item.refId);
                if (route) router.push(route as never);
                else showFeedback("通知已读", "这条通知没有可打开的页面，相关内容可能已结束或被删除。");
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View className="flex-row px-4 py-3">
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mt-0.5">
                  <IconSymbol
                    name={item.category === "order" ? "cart.fill" : item.category === "project" ? "folder.fill" : "bell.fill"}
                    size={18}
                    color="#16A34A"
                  />
                </View>
                <View className="flex-1 ml-3 border-b border-border pb-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                      <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!item.isRead ? <View className="w-2 h-2 rounded-full bg-error ml-2" /> : null}
                    </View>
                    <Text className="text-xs text-muted ml-2">{formatTime(item.createdAt)}</Text>
                  </View>
                  <Text className="text-sm text-muted mt-0.5 leading-5" numberOfLines={2}>
                    {item.content}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

export default function MessagesScreen() {
  return (
    <ScreenContainer>
      <AuthGate title="登录后查看消息">
        <MessagesInner />
      </AuthGate>
    </ScreenContainer>
  );
}
