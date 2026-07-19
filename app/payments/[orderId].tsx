import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";

const NOTICE = "沙箱支付，仅用于开发测试，不产生真实资金交易。";

function SandboxPaymentInner() {
  const { orderId: rawOrderId } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(rawOrderId);
  const router = useRouter();
  const utils = trpc.useUtils();
  const finance = trpc.payments.byOrder.useQuery({ orderId }, { enabled: Number.isInteger(orderId) && orderId > 0 });
  const [error, setError] = useState("");
  const createKey = useMemo(() => `pay-create-${orderId}-${Date.now()}`, [orderId]);
  const confirmKey = useMemo(() => `pay-confirm-${orderId}-${Date.now()}`, [orderId]);
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: () => utils.payments.byOrder.invalidate({ orderId }),
    onError: (e) => setError(e.message),
  });
  const confirmPayment = trpc.payments.confirmSandbox.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.payments.byOrder.invalidate({ orderId }),
        utils.orders.detail.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
        utils.projects.list.invalidate(),
      ]);
    },
    onError: (e) => setError(e.message),
  });

  if (finance.isLoading) return <LoadingView />;
  if (!finance.data) return <EmptyState title="订单不存在或无权查看" />;
  const { order, payment, escrow } = finance.data;
  const isPaid = payment?.status === "success" || payment?.status === "partially_refunded" || payment?.status === "refunded";

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-warning/10 border border-warning/40 rounded-2xl p-4">
        <Text className="text-base font-bold text-warning">开发测试环境</Text>
        <Text className="text-sm text-foreground leading-6 mt-2">{NOTICE}</Text>
      </View>

      <View className="bg-surface border border-border rounded-2xl p-4 mt-3">
        <Text className="text-lg font-bold text-foreground">{order.title}</Text>
        <Text className="text-3xl font-bold text-action mt-2">¥{order.amount}</Text>
        <View className="mt-4 pt-3 border-t border-border">
          <InfoRow label="订单编号" value={`SH${String(order.id).padStart(8, "0")}`} />
          <InfoRow label="支付渠道" value="SandboxPaymentProvider" />
          <InfoRow label="币种" value={payment?.currency ?? "CNY"} />
        </View>
      </View>

      {payment ? (
        <View className="bg-surface border border-border rounded-2xl p-4 mt-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-foreground">支付单 {payment.paymentNo}</Text>
            <StatusBadge label={payment.status} tone={isPaid ? "green" : payment.status === "failed" ? "red" : "orange"} />
          </View>
          {payment.providerTransactionNo ? <Text className="text-xs text-muted mt-3">沙箱交易号：{payment.providerTransactionNo}</Text> : null}
          {escrow ? <Text className="text-sm text-foreground mt-3">托管状态：{escrow.status} · 已托管 ¥{escrow.fundedAmount}</Text> : null}
        </View>
      ) : null}

      {!payment ? (
        <View className="mt-4">
          <PrimaryButton title="创建沙箱支付单" variant="action" loading={createPayment.isPending} onPress={() => {
            setError("");
            createPayment.mutate({ orderId, amount: order.amount, idempotencyKey: createKey });
          }} />
        </View>
      ) : null}

      {payment && !isPaid ? (
        <View className="mt-4">
          <PrimaryButton title={`确认沙箱支付 ¥${payment.amount}`} variant="action" loading={confirmPayment.isPending} onPress={() => {
            setError("");
            confirmPayment.mutate({ paymentId: payment.id, idempotencyKey: confirmKey });
          }} />
        </View>
      ) : null}

      {isPaid ? (
        <View className="mt-4">
          <PrimaryButton title="返回订单详情" onPress={() => router.replace(`/orders/${order.id}` as never)} />
        </View>
      ) : null}
      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
    </ScrollView>
  );
}

export default function SandboxPaymentScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="沙箱托管支付" />
      <AuthGate title="登录后完成沙箱支付"><SandboxPaymentInner /></AuthGate>
    </ScreenContainer>
  );
}
