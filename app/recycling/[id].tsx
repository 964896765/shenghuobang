import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/role-context";
import { useAuth } from "@/hooks/use-auth";
import {
  AppTextInput,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FieldLabel,
  InfoRow,
  LoadingView,
  PrimaryButton,
  StatusBadge,
} from "@/components/common";
import { RECYCLING_STATUS, RECYCLING_QUOTE_STATUS, formatTime } from "@/lib/labels";

function RecyclingDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = Number(id);
  const router = useRouter();
  const { profile } = useRole();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const detail = trpc.recycling.detail.useQuery({ id: requestId }, { enabled: !Number.isNaN(requestId) });

  const [error, setError] = useState("");
  const [selectTarget, setSelectTarget] = useState<number | null>(null);
  const [declineTarget, setDeclineTarget] = useState<number | null>(null);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  const invalidate = () => {
    utils.recycling.detail.invalidate({ id: requestId });
    utils.recycling.myRequests.invalidate();
    utils.recycling.openRequests.invalidate();
  };

  const selectMut = trpc.recycling.selectQuote.useMutation({
    onSuccess: (res) => {
      setSelectTarget(null);
      invalidate();
      utils.orders.list.invalidate();
      router.push(`/orders/${res.orderId}` as any);
    },
    onError: (e) => {
      setSelectTarget(null);
      setError(e.message);
    },
  });
  const quoteMut = trpc.recycling.submitQuote.useMutation({
    onSuccess: () => {
      setShowQuoteForm(false);
      setAmount("");
      setNote("");
      setPickupTime("");
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const declineMut = trpc.recycling.declineQuote.useMutation({
    onSuccess: () => {
      setDeclineTarget(null);
      invalidate();
    },
    onError: (e) => {
      setDeclineTarget(null);
      setError(e.message);
    },
  });
  const cancelMut = trpc.recycling.cancel.useMutation({
    onSuccess: () => {
      setCancelVisible(false);
      invalidate();
    },
    onError: (e) => {
      setCancelVisible(false);
      setError(e.message);
    },
  });

  if (detail.isLoading) return <LoadingView />;
  if (detail.isError) return <ErrorState title="无法加载回收询价" hint={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <EmptyState title="询价单不存在" />;

  const { request, quotes, order, isOwner } = detail.data;
  const st = RECYCLING_STATUS[request.status] ?? { label: request.status, tone: "gray" as const };
  const isMerchant = profile?.merchantStatus === "active";
  const canQuote = isMerchant && !isOwner && ["quoting", "quoted"].includes(request.status);
  const myQuote = quotes.find((q) => q.merchantUserId === user?.id);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <View className="flex-row items-center justify-between mb-2">
            <StatusBadge label={st.label} tone={st.tone} />
            <Text className="text-xs text-muted">{formatTime(request.createdAt)}</Text>
          </View>
          <Text className="text-xl font-bold text-foreground leading-7">{request.title}</Text>
          <View className="mt-3 pt-3 border-t border-border">
            <InfoRow label="分类" value={request.category} />
            <InfoRow label="城市" value={request.cityName} />
            <InfoRow label="期望价格" value={request.expectedPrice ? `¥${request.expectedPrice}` : "由商家报价"} />
            <InfoRow label="状况描述" value={request.conditionDesc} />
          </View>
        </View>

        {/* 报价列表 */}
        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-base font-semibold text-foreground mb-2">商家报价 {quotes.length}</Text>
          {quotes.length === 0 ? (
            <Text className="text-sm text-muted">等待商家报价中,通常几小时内会有响应。</Text>
          ) : (
            quotes.map((q) => {
              const qst = RECYCLING_QUOTE_STATUS[q.status] ?? { label: q.status, tone: "gray" as const };
              const canSelect = isOwner && q.status === "submitted" && ["quoting", "quoted"].includes(request.status);
              return (
                <View key={q.id} className="py-2.5 border-b border-border">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground flex-1" numberOfLines={1}>
                      {q.merchantName ?? "回收商家"}
                    </Text>
                    <Text className="text-lg font-bold text-action mr-2">¥{q.amount}</Text>
                    <StatusBadge label={qst.label} tone={qst.tone} small />
                  </View>
                  {q.note ? <Text className="text-xs text-muted mt-1">{q.note}</Text> : null}
                  {q.pickupTime ? <Text className="text-xs text-muted mt-0.5">可上门时间:{q.pickupTime}</Text> : null}
                  {canSelect ? (
                    <View className="flex-row gap-2 mt-2">
                      <View className="flex-1"><PrimaryButton title="选择该商家" small onPress={() => setSelectTarget(q.id)} /></View>
                      <View className="flex-1"><PrimaryButton title="暂不考虑" variant="muted" small onPress={() => setDeclineTarget(q.id)} /></View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* 商家报价操作 */}
        {canQuote && !myQuote ? (
          <View className="mt-4">
            {!showQuoteForm ? (
              <PrimaryButton title="提交回收报价" onPress={() => setShowQuoteForm(true)} />
            ) : (
              <View className="bg-surface rounded-2xl border border-border p-4">
                <Text className="text-base font-semibold text-foreground">提交回收报价</Text>
                <FieldLabel label="报价金额(元)" required />
                <AppTextInput placeholder="如:150" value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <FieldLabel label="备注(选填)" />
                <AppTextInput placeholder="如:价格以实物检测为准" value={note} onChangeText={setNote} />
                <FieldLabel label="可上门时间(选填)" />
                <AppTextInput placeholder="如:今天下午 / 明天全天" value={pickupTime} onChangeText={setPickupTime} />
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <PrimaryButton title="取消" variant="muted" onPress={() => setShowQuoteForm(false)} />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      title="提交报价"
                      onPress={() => {
                        const num = parseInt(amount, 10);
                        if (Number.isNaN(num) || num < 1) {
                          setError("请填写有效报价金额");
                          return;
                        }
                        setError("");
                        quoteMut.mutate({ requestId, amount: num, note: note.trim() || undefined, pickupTime: pickupTime.trim() || undefined });
                      }}
                      loading={quoteMut.isPending}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : null}
        {canQuote && myQuote ? (
          <View className="bg-primary/5 rounded-xl p-3 mt-3 border border-primary/20">
            <Text className="text-sm text-foreground">你已提交报价 ¥{myQuote.amount},等待用户选择。</Text>
          </View>
        ) : null}

        {order ? (
          <View className="bg-primary/5 rounded-2xl p-4 mt-3 border border-primary/20">
            <Text className="text-sm text-foreground mb-3">已生成回收订单，请在订单中继续上门检测、交付和完成确认。</Text>
            <PrimaryButton title="查看回收订单" onPress={() => router.push(`/orders/${order.id}` as never)} />
          </View>
        ) : null}

        {isOwner && ["quoting", "quoted"].includes(request.status) ? (
          <View className="mt-4"><PrimaryButton title="取消回收询价" variant="muted" onPress={() => setCancelVisible(true)} /></View>
        ) : null}

        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
      </ScrollView>

      <ConfirmDialog
        visible={selectTarget !== null}
        title="选择该商家"
        message="选择后将建立回收订单,商家会与你联系并安排上门检测取件。确认选择吗?"
        confirmText="确认选择"
        loading={selectMut.isPending}
        onCancel={() => setSelectTarget(null)}
        onConfirm={() => selectTarget && selectMut.mutate({ requestId, quoteId: selectTarget })}
      />
      <ConfirmDialog
        visible={declineTarget !== null}
        title="暂不考虑该报价"
        message="该商家会收到未被选择的通知；其他报价仍可继续处理。"
        confirmText="确认"
        loading={declineMut.isPending}
        onCancel={() => setDeclineTarget(null)}
        onConfirm={() => declineTarget && declineMut.mutate({ requestId, quoteId: declineTarget })}
      />
      <ConfirmDialog
        visible={cancelVisible}
        title="取消回收询价"
        message="取消后商家不能继续报价，物品会恢复为可管理状态。"
        confirmText="确认取消"
        danger
        loading={cancelMut.isPending}
        onCancel={() => setCancelVisible(false)}
        onConfirm={() => cancelMut.mutate({ id: requestId })}
      />
    </KeyboardAvoidingView>
  );
}

export default function RecyclingDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="回收询价" />
      <AuthGate title="登录后查看询价详情">
        <RecyclingDetailInner />
      </AuthGate>
    </ScreenContainer>
  );
}
