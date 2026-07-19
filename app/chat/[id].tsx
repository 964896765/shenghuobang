import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { EmptyState, ErrorState, LoadingView, PrimaryButton } from "@/components/common";
import { formatTime } from "@/lib/labels";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRealtime, type RealtimeEnvelope } from "@/hooks/use-realtime";
import { dedupeMessages } from "@/lib/message-display";

function ChatInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const { user } = useAuth();
  const colors = useColors();
  const utils = trpc.useUtils();
  const listRef = useRef<FlatList>(null);
  const cursorInitialized = useRef(false);
  const [text, setText] = useState("");
  const data = trpc.messagesRouter.messages.useQuery(
    { conversationId },
    { enabled: !Number.isNaN(conversationId), refetchInterval: 30000 },
  );
  const [olderMessages, setOlderMessages] = useState<NonNullable<typeof data.data>["messages"]>([]);
  const [nextCursor, setNextCursor] = useState<number>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [failedSend, setFailedSend] = useState<{ conversationId: number; clientMessageId: string; content: string; error: string }>();
  const realtimeStatus = useRealtime({
    conversationId,
    enabled: !Number.isNaN(conversationId),
    onEvent: useCallback((event: RealtimeEnvelope) => {
      if (["message.created", "message.read", "message.delivered", "sync.required"].includes(event.type)) {
        utils.messagesRouter.messages.invalidate({ conversationId });
        utils.messagesRouter.receipts.invalidate({ conversationId });
        utils.messagesRouter.conversations.invalidate();
      }
    }, [conversationId, utils]),
  });
  const receipts = trpc.messagesRouter.receipts.useQuery({ conversationId }, { enabled: !Number.isNaN(conversationId) });
  const markRead = trpc.messagesRouter.markConversationRead.useMutation({
    onSuccess: () => utils.messagesRouter.conversations.invalidate(),
  });
  const markConversationRead = markRead.mutate;
  useEffect(() => {
    if (data.data?.messages.length) markConversationRead({ conversationId });
  }, [conversationId, data.data?.messages.length, markConversationRead]);
  const sendMut = trpc.messagesRouter.send.useMutation({
    onSuccess: (_result, variables) => {
      setText((current) => current.trim() === variables.content ? "" : current);
      setFailedSend(undefined);
      utils.messagesRouter.messages.invalidate({ conversationId });
      utils.messagesRouter.conversations.invalidate();
    },
    onError: (error, variables) => setFailedSend({ ...variables, error: error.message }),
  });

  useEffect(() => {
    cursorInitialized.current = false;
    setOlderMessages([]);
    setNextCursor(undefined);
    setFailedSend(undefined);
  }, [conversationId]);
  useEffect(() => {
    if (!cursorInitialized.current && data.data) {
      cursorInitialized.current = true;
      setNextCursor(data.data.nextCursor);
    }
  }, [data.data]);

  if (data.isLoading) return <LoadingView />;
  if (data.isError) return <ErrorState title="无法加载会话" hint={data.error.message} onRetry={() => data.refetch()} />;
  if (!data.data) return <EmptyState title="会话不存在" />;

  const messages = dedupeMessages([...olderMessages, ...data.data.messages]);

  const handleSend = () => {
    const content = text.trim();
    if (!content || sendMut.isPending) return;
    const clientMessageId = `${user?.id ?? "anonymous"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sendMut.mutate({ conversationId, clientMessageId, content });
  };

  const loadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    try {
      setLoadingOlder(true);
      const page = await utils.client.messagesRouter.messages.query({ conversationId, cursor: nextCursor, limit: 50 });
      setOlderMessages((current) => dedupeMessages([...page.messages, ...current]));
      setNextCursor(page.nextCursor);
    } catch (error) {
      setFailedSend({ conversationId, clientMessageId: "history", content: "", error: error instanceof Error ? error.message : "更早消息加载失败" });
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "android" ? 96 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={nextCursor ? <View className="mb-3"><PrimaryButton title="加载更早消息" variant="outline" small onPress={loadOlder} loading={loadingOlder} /></View> : null}
        ListEmptyComponent={<EmptyState title="开始对话吧" hint="友好沟通,重要约定请在订单/项目中确认。" />}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View className={mine ? "items-end mb-3" : "items-start mb-3"}>
              <View className={mine ? "bg-primary rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[80%]" : "bg-surface border border-border rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[80%]"}>
                <Text className={mine ? "text-white text-[15px] leading-5" : "text-foreground text-[15px] leading-5"}>{item.content}</Text>
              </View>
              <Text className="text-[10px] text-muted mt-1">
                {formatTime(item.createdAt)}{mine ? (receipts.data?.some((r) => r.messageId === item.id && r.readAt) ? " · 已读" : receipts.data?.some((r) => r.messageId === item.id && r.deliveredAt) ? " · 已送达" : " · 已发送") : ""}
              </Text>
            </View>
          );
        }}
      />
      {realtimeStatus !== "connected" ? (
        <View className="px-4 py-1 bg-amber-50"><Text className="text-[11px] text-amber-700">{realtimeStatus === "reconnecting" ? "实时连接正在重连" : realtimeStatus === "polling" ? "实时连接不可用，正在使用轮询同步" : "当前离线，可继续查看已加载消息"}</Text></View>
      ) : null}
      {failedSend ? (
        <View className="px-4 py-2 bg-red-50 border-t border-red-100">
          <Text className="text-xs text-error">{failedSend.clientMessageId === "history" ? failedSend.error : `发送失败：${failedSend.error}`}</Text>
          {failedSend.clientMessageId !== "history" ? (
            <Pressable onPress={() => sendMut.mutate({ conversationId: failedSend.conversationId, clientMessageId: failedSend.clientMessageId, content: failedSend.content })} disabled={sendMut.isPending}>
              <Text className="text-xs text-primary font-semibold mt-1">重试发送</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row items-center gap-2 px-3 py-2 border-t border-border bg-background">
        <TextInput
          className="flex-1 bg-surface border border-border rounded-full px-4 py-2.5 text-[15px] text-foreground"
          placeholder="输入消息..."
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          blurOnSubmit={false}
          style={{ maxHeight: 112, minHeight: 42, textAlignVertical: "top" }}
          maxLength={1000}
        />
        <Pressable disabled={sendMut.isPending || !text.trim()} onPress={handleSend} style={({ pressed }) => ({ opacity: pressed || !text.trim() || sendMut.isPending ? 0.6 : 1 })}>
          <View className="bg-primary rounded-full w-10 h-10 items-center justify-center">
            <IconSymbol name="paperplane.fill" size={18} color="#fff" />
          </View>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const { isAuthenticated } = useAuth();
  const header = trpc.messagesRouter.messages.useQuery(
    { conversationId },
    { enabled: !Number.isNaN(conversationId) && isAuthenticated },
  );
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title={header.data?.otherNickname ?? "聊天"} />
      <AuthGate title="登录后查看聊天">
        <ChatInner />
      </AuthGate>
    </ScreenContainer>
  );
}
