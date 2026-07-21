import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AuthGate } from "@/components/auth-gate";
import { Avatar, EmptyState, ErrorState, LoadingView } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatTime } from "@/lib/labels";
import { dedupeNotifications } from "@/lib/message-display";
import { notificationRoute } from "@/lib/notification-navigation";
import { trpc } from "@/lib/trpc";
import { MESSAGE_CHANNELS } from "@/shared/navigation/appNavigation";

type Channel = (typeof MESSAGE_CHANNELS)[number]["id"];

function MessagesInner() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("chat");
  const conversations = trpc.messagesRouter.conversations.useQuery();
  const notifications = trpc.messagesRouter.notifications.useQuery();
  const utils = trpc.useUtils();
  const markRead = trpc.messagesRouter.markRead.useMutation({ onSuccess: () => {
    void utils.messagesRouter.notifications.invalidate();
    void utils.messagesRouter.unreadCount.invalidate();
  } });
  const rows = useMemo(() => {
    const all = dedupeNotifications(notifications.data ?? []);
    if (channel === "business") return all.filter((item) => ["order", "project", "need"].includes(String(item.category)));
    if (channel === "interaction") return all.filter((item) => ["interaction", "content", "social"].includes(String(item.category)));
    if (channel === "system") return all.filter((item) => String(item.category) === "system");
    return [];
  }, [channel, notifications.data]);

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pb-3 pt-3">
        <Text className="text-2xl font-bold text-foreground">消息</Text>
        {channel !== "chat" ? <Pressable onPress={() => markRead.mutate({})}><Text className="text-sm text-primary">全部已读</Text></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        {MESSAGE_CHANNELS.map((item) => (
          <Pressable key={item.id} onPress={() => setChannel(item.id)} className={`mx-1 rounded-full px-5 py-2 ${channel === item.id ? "bg-primary" : "border border-border bg-surface"}`}>
            <Text className={channel === item.id ? "font-medium text-white" : "text-foreground"}>{item.title}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {channel === "chat" ? conversations.isLoading ? <LoadingView /> : conversations.isError ? (
        <ErrorState title="无法加载会话" hint={conversations.error.message} onRetry={() => conversations.refetch()} />
      ) : (
        <FlatList
          data={conversations.data ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={conversations.isRefetching} onRefresh={() => conversations.refetch()} />}
          ListEmptyComponent={<EmptyState title="暂无聊天" hint="从需求、产品或服务场景发起沟通后，会话会统一显示在这里。" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/chat/${item.id}` as never)} className="flex-row items-center px-4 py-3">
              <Avatar name={item.otherNickname} size={46} />
              <View className="ml-3 flex-1 border-b border-border pb-3">
                <View className="flex-row justify-between"><Text className="font-semibold text-foreground">{item.otherNickname}</Text><Text className="text-xs text-muted">{formatTime(item.lastMessageAt)}</Text></View>
                <Text className="mt-1 text-sm text-muted" numberOfLines={1}>{item.lastMessage ?? "开始聊天"}</Text>
              </View>
              {item.unreadCount > 0 ? <View className="ml-2 min-w-5 rounded-full bg-error px-1.5 py-0.5"><Text className="text-center text-[10px] text-white">{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text></View> : null}
            </Pressable>
          )}
        />
      ) : notifications.isLoading ? <LoadingView /> : notifications.isError ? (
        <ErrorState title="无法加载消息" hint={notifications.error.message} onRetry={() => notifications.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={notifications.isRefetching} onRefresh={() => notifications.refetch()} />}
          ListEmptyComponent={<EmptyState title={`暂无${MESSAGE_CHANNELS.find((item) => item.id === channel)?.title}消息`} hint="相关消息产生后会统一映射到当前分类。" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => {
              if (!item.isRead) markRead.mutate({ id: item.id });
              const route = notificationRoute(item.refType, item.refId);
              if (route) router.push(route as never);
            }} className="flex-row px-4 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10"><IconSymbol name={String(item.category) === "order" ? "cart.fill" : String(item.category) === "project" ? "folder.fill" : "message.fill"} size={19} color="#16A34A" /></View>
              <View className="ml-3 flex-1 border-b border-border pb-3">
                <View className="flex-row items-center"><Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>{item.title}</Text>{!item.isRead ? <View className="h-2 w-2 rounded-full bg-error" /> : null}</View>
                <Text className="mt-1 text-sm text-muted" numberOfLines={2}>{item.content}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

export default function MessagesScreen() {
  return <ScreenContainer><AuthGate title="登录后查看消息"><MessagesInner /></AuthGate></ScreenContainer>;
}
