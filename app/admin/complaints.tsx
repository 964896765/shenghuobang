import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ConfirmDialog, EmptyState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";

type Decision = "dismiss" | "continue_performance" | "redeliver" | "full_refund" | "partial_refund" | "release_all" | "partial_release";

export default function AdminComplaintsScreen() {
  const list = trpc.adminComplaints.list.useQuery();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [partialContinue, setPartialContinue] = useState(true);
  const [error, setError] = useState("");
  const detail = trpc.adminComplaints.detail.useQuery({ id: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const refresh = () => { utils.adminComplaints.list.invalidate(); if (selectedId) utils.adminComplaints.detail.invalidate({ id: selectedId }); };
  const requestEvidence = trpc.adminComplaints.requestEvidence.useMutation({ onSuccess: refresh, onError: (e) => setError(e.message) });
  const negotiate = trpc.adminComplaints.negotiate.useMutation({ onSuccess: refresh, onError: (e) => setError(e.message) });
  const decide = trpc.adminComplaints.decide.useMutation({ onSuccess: () => { setDecision(null); setReason(""); refresh(); }, onError: (e) => { setDecision(null); setError(e.message); } });

  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="投诉处理" /><AuthGate title="投诉运营登录后访问">
    {list.isLoading ? <LoadingView /> : !list.data ? <EmptyState title="无权访问" /> : <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
      {list.data.map((item) => <View key={item.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <View className="flex-row justify-between"><Text className="font-semibold text-foreground">投诉 #{item.id} · {item.complaintType}</Text><StatusBadge label={item.status} tone={item.status === "resolved" ? "green" : "orange"} /></View>
        <Text className="text-sm text-muted mt-2" numberOfLines={2}>{item.description}</Text>
        <View className="mt-3"><PrimaryButton small variant="outline" title="查看案件" onPress={() => setSelectedId(item.id)} /></View>
      </View>)}
      {selectedId && detail.data ? <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
        <Text className="text-base font-bold text-foreground">案件 #{selectedId}</Text>
        <Text className="text-sm text-foreground mt-2 leading-5">投诉方：{detail.data.complaint.description}</Text>
        <Text className="text-sm text-foreground mt-2 leading-5">被投诉方：{detail.data.complaint.respondentStatement ?? "尚未回应"}</Text>
        <Text className="text-sm text-muted mt-2">证据 {detail.data.evidence.length} 份 · 时间线 {detail.data.timeline.length} 条</Text>
        <AppTextInput value={reason} onChangeText={setReason} multiline placeholder="填写操作说明或裁定理由" />
        <AppTextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="部分退款/释放金额（按需填写）" />
        <View className="mt-3"><PrimaryButton variant="outline" title="要求补证" onPress={() => requestEvidence.mutate({ id: selectedId, note: reason })} disabled={reason.trim().length < 2} /></View>
        <View className="mt-2"><PrimaryButton variant="outline" title="发起协商" onPress={() => negotiate.mutate({ id: selectedId, note: reason })} disabled={reason.trim().length < 2} /></View>
        <View className="mt-2"><PrimaryButton title="裁定：继续履约" onPress={() => setDecision("continue_performance")} disabled={reason.trim().length < 5} /></View>
        <View className="mt-2"><PrimaryButton variant="action" title="裁定：全额退款" onPress={() => setDecision("full_refund")} disabled={reason.trim().length < 5} /></View>
        <View className="mt-2"><PrimaryButton variant="outline" title="部分退款并继续履约" onPress={() => { setPartialContinue(true); setDecision("partial_refund"); }} disabled={reason.trim().length < 5 || !amount} /></View>
        <View className="mt-2"><PrimaryButton variant="outline" title="部分退款并暂停履约" onPress={() => { setPartialContinue(false); setDecision("partial_refund"); }} disabled={reason.trim().length < 5 || !amount} /></View>
        <View className="mt-2"><PrimaryButton variant="danger" title="驳回投诉" onPress={() => setDecision("dismiss")} disabled={reason.trim().length < 5} /></View>
      </View> : null}
      {error ? <Text className="text-error mt-3">{error}</Text> : null}
    </ScrollView>}
    <ConfirmDialog visible={decision !== null} title="确认平台裁定" message="该操作会处理资金或案件状态，并生成不可删除的审计记录。确认继续？" confirmText="确认裁定" danger loading={decide.isPending} onCancel={() => setDecision(null)} onConfirm={() => {
      if (!selectedId || !decision) return;
      decide.mutate({ id: selectedId, result: decision, reason, refundAmount: decision === "partial_refund" ? amount : undefined, continuePerformance: decision === "partial_refund" ? partialContinue : undefined, confirmation: `CONFIRM:complaint:${selectedId}` });
    }} />
  </AuthGate></ScreenContainer>;
}
