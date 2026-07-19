import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ConfirmDialog, EmptyState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";

type Action = { kind: "approve_refund" | "reject_refund" | "execute_refund" | "retry_refund" | "approve_settlement" | "release_settlement"; id: number };

export default function AdminFinanceScreen() {
  const refunds = trpc.adminFinance.refunds.useQuery();
  const settlements = trpc.adminFinance.settlements.useQuery();
  const utils = trpc.useUtils();
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const refresh = () => { setAction(null); utils.adminFinance.refunds.invalidate(); utils.adminFinance.settlements.invalidate(); };
  const opts = { onSuccess: refresh, onError: (e: { message: string }) => { setAction(null); setError(e.message); } };
  const approveRefund = trpc.adminFinance.approveRefund.useMutation(opts);
  const rejectRefund = trpc.adminFinance.rejectRefund.useMutation(opts);
  const executeRefund = trpc.adminFinance.executeRefund.useMutation(opts);
  const retryRefund = trpc.adminFinance.retryRefund.useMutation(opts);
  const approveSettlement = trpc.adminFinance.approveSettlement.useMutation(opts);
  const releaseSettlement = trpc.adminFinance.releaseSettlement.useMutation(opts);
  const loading = approveRefund.isPending || rejectRefund.isPending || executeRefund.isPending || retryRefund.isPending || approveSettlement.isPending || releaseSettlement.isPending;
  const runAction = () => {
    if (!action) return;
    if (action.kind === "approve_refund") approveRefund.mutate({ refundId: action.id, reviewReason: "财务人工复核通过", confirmation: `CONFIRM:refund:${action.id}` });
    if (action.kind === "reject_refund") rejectRefund.mutate({ refundId: action.id, reviewReason: "财务人工复核未通过，请联系平台补充材料", confirmation: `CONFIRM:refund-reject:${action.id}` });
    if (action.kind === "execute_refund") executeRefund.mutate({ refundId: action.id, confirmation: `CONFIRM:refund-execute:${action.id}` });
    if (action.kind === "retry_refund") retryRefund.mutate({ refundId: action.id, confirmation: `CONFIRM:refund-retry:${action.id}` });
    if (action.kind === "approve_settlement") approveSettlement.mutate({ settlementId: action.id, confirmation: `CONFIRM:settlement:${action.id}` });
    if (action.kind === "release_settlement") releaseSettlement.mutate({ settlementId: action.id, idempotencyKey: `admin-release-${action.id}-${Date.now()}`, confirmation: `CONFIRM:settlement-release:${action.id}` });
  };
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="财务与结算" /><AuthGate title="财务管理员登录后访问">
    {refunds.isLoading || settlements.isLoading ? <LoadingView /> : !refunds.data || !settlements.data ? <EmptyState title="无权访问" /> : <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      <Text className="text-lg font-bold text-foreground mb-3">退款申请</Text>
      {refunds.data.length === 0 ? <Text className="text-sm text-muted mb-4">暂无退款申请</Text> : refunds.data.map((item) => <View key={item.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <View className="flex-row justify-between"><Text className="font-semibold text-foreground">{item.refundNo}</Text><StatusBadge label={item.status} tone={item.status === "success" ? "green" : "orange"} /></View>
        <Text className="text-xl font-bold text-action mt-2">¥{item.amount}</Text><Text className="text-sm text-muted mt-1">{item.reason}</Text>
        {(["submitted", "under_review"] as string[]).includes(item.status) ? <><View className="mt-3"><PrimaryButton small title="复核批准" onPress={() => setAction({ kind: "approve_refund", id: item.id })} /></View><View className="mt-2"><PrimaryButton small variant="danger" title="拒绝退款" onPress={() => setAction({ kind: "reject_refund", id: item.id })} /></View></> : null}
        {item.status === "approved" ? <View className="mt-3"><PrimaryButton small variant="action" title="执行沙箱退款" onPress={() => setAction({ kind: "execute_refund", id: item.id })} /></View> : null}
        {item.status === "failed" ? <View className="mt-3"><PrimaryButton small variant="action" title="受控重试退款" onPress={() => setAction({ kind: "retry_refund", id: item.id })} /></View> : null}
      </View>)}
      <Text className="text-lg font-bold text-foreground mt-3 mb-3">阶段结算</Text>
      {settlements.data.length === 0 ? <Text className="text-sm text-muted">暂无结算申请</Text> : settlements.data.map((item) => <View key={item.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <View className="flex-row justify-between"><Text className="font-semibold text-foreground">{item.settlementNo}</Text><StatusBadge label={item.status} tone={item.status === "settled" ? "green" : item.status === "frozen" ? "red" : "orange"} /></View>
        <Text className="text-xl font-bold text-action mt-2">¥{item.amount}</Text><Text className="text-xs text-muted mt-1">项目 #{item.projectId} · 里程碑 #{item.milestoneId}</Text>
        {(["pending", "under_review"] as string[]).includes(item.status) ? <View className="mt-3"><PrimaryButton small title="批准结算" onPress={() => setAction({ kind: "approve_settlement", id: item.id })} /></View> : null}
        {item.status === "approved" ? <View className="mt-3"><PrimaryButton small variant="action" title="释放托管资金" onPress={() => setAction({ kind: "release_settlement", id: item.id })} /></View> : null}
      </View>)}
      {error ? <Text className="text-error mt-3">{error}</Text> : null}
    </ScrollView>}
    <ConfirmDialog visible={action !== null} title="高风险操作二次确认" message="该操作将改变退款、托管或结算账本，并写入审计日志。确认继续？" confirmText="确认执行" danger loading={loading} onCancel={() => setAction(null)} onConfirm={runAction} />
  </AuthGate></ScreenContainer>;
}
