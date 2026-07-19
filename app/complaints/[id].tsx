import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/labels";

const STATUS: Record<string, { label: string; tone: "gray" | "green" | "red" | "orange" | "blue" }> = {
  submitted: { label: "已提交", tone: "orange" }, waiting_response: { label: "等待回应", tone: "orange" }, under_review: { label: "平台审核中", tone: "blue" }, negotiating: { label: "协商中", tone: "blue" }, resolved: { label: "已处理", tone: "green" }, rejected: { label: "已驳回", tone: "red" }, withdrawn: { label: "已撤回", tone: "gray" }, closed: { label: "已关闭", tone: "gray" },
};

function ComplaintDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const complaintId = Number(id);
  const { user } = useAuth();
  const detail = trpc.complaints.detail.useQuery({ id: complaintId }, { enabled: Number.isFinite(complaintId) });
  const utils = trpc.useUtils();
  const [statement, setStatement] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [error, setError] = useState("");
  const respond = trpc.complaints.respond.useMutation({ onSuccess: () => { setStatement(""); utils.complaints.detail.invalidate({ id: complaintId }); }, onError: (e) => setError(e.message) });
  const addEvidence = trpc.complaints.addEvidence.useMutation({ onSuccess: () => { setEvidenceText(""); utils.complaints.detail.invalidate({ id: complaintId }); }, onError: (e) => setError(e.message) });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="投诉不存在或无权查看" />;
  const { complaint, evidence, timeline, decision, fundActions, creditActions } = detail.data;
  const st = STATUS[complaint.status] ?? { label: complaint.status, tone: "gray" as const };
  const isRespondent = complaint.respondentId === user?.id;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between"><Text className="text-base font-bold text-foreground">投诉 #{complaint.id}</Text><StatusBadge label={st.label} tone={st.tone} /></View>
        <Text className="text-xs text-muted mt-2">{complaint.relatedType} #{complaint.relatedId} · {formatTime(complaint.createdAt)}</Text>
        <Text className="text-sm font-semibold text-foreground mt-4">投诉类型：{complaint.complaintType}</Text>
        <Text className="text-sm text-foreground mt-2 leading-5">{complaint.description}</Text>
        {complaint.expectedResolution ? <Text className="text-sm text-muted mt-3 leading-5">期望处理：{complaint.expectedResolution}</Text> : null}
      </View>

      {complaint.respondentStatement ? <View className="bg-surface rounded-2xl border border-border p-4 mt-3"><Text className="text-sm font-semibold text-foreground">被投诉方回应</Text><Text className="text-sm text-foreground mt-2 leading-5">{complaint.respondentStatement}</Text></View> : null}
      {complaint.resolution ? <View className="bg-primary/5 rounded-2xl border border-primary/20 p-4 mt-3"><Text className="text-sm font-semibold text-primary">平台处理结果</Text><Text className="text-sm text-foreground mt-2 leading-5">{complaint.resolution}</Text></View> : null}
      {decision ? <View className="bg-surface rounded-2xl border border-border p-4 mt-3"><Text className="text-sm font-semibold text-foreground">裁定：{decision.result}</Text><Text className="text-sm text-muted mt-2">退款 ¥{decision.refundAmount ?? "0.00"} · 释放 ¥{decision.releaseAmount ?? "0.00"}</Text><Text className="text-sm text-foreground mt-2 leading-5">{decision.reason}</Text></View> : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
        <Text className="text-base font-semibold text-foreground">案件时间线</Text>
        {timeline.map((item) => <View key={item.id} className="border-b border-border py-2"><Text className="text-sm text-foreground">{item.fromStatus ?? "创建"} → {item.toStatus}</Text><Text className="text-xs text-muted mt-1">{item.note ?? "状态更新"} · {formatTime(item.createdAt)}</Text></View>)}
        {fundActions.length ? <Text className="text-xs text-muted mt-3">资金处理记录：{fundActions.length} 条</Text> : null}
        {creditActions.length ? <Text className="text-xs text-muted mt-1">信用处理记录：{creditActions.length} 条</Text> : null}
      </View>

      {isRespondent && ["submitted", "waiting_response", "under_review"].includes(complaint.status) && !complaint.respondentStatement ? (
        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <FieldLabel label="回应投诉" required />
          <AppTextInput value={statement} onChangeText={setStatement} multiline placeholder="说明你的履约情况、依据和处理建议" />
          <View className="mt-3"><PrimaryButton title="提交正式回应" onPress={() => respond.mutate({ id: complaintId, statement: statement.trim() })} loading={respond.isPending} disabled={statement.trim().length < 2} /></View>
        </View>
      ) : null}

      <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
        <Text className="text-base font-semibold text-foreground">证据与补充说明</Text>
        {evidence.length === 0 ? <Text className="text-sm text-muted mt-2">暂无补充证据。</Text> : evidence.map((item) => <View key={item.id} className="border-b border-border py-3"><Text className="text-sm text-foreground leading-5">{item.description || item.fileName || "证据"}</Text><Text className="text-xs text-muted mt-1">提交人 #{item.submitterId} · {formatTime(item.createdAt)}</Text></View>)}
        <FieldLabel label="补充说明" />
        <AppTextInput value={evidenceText} onChangeText={setEvidenceText} multiline placeholder="描述聊天、交付、测试或其他可核验事实" />
        <View className="mt-3"><PrimaryButton title="提交补充证据" variant="outline" onPress={() => addEvidence.mutate({ complaintId, description: evidenceText.trim() })} loading={addEvidence.isPending} disabled={evidenceText.trim().length < 2} /></View>
      </View>
      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
    </ScrollView>
  );
}

export default function ComplaintDetailScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="投诉详情" /><AuthGate title="登录后查看投诉"><ComplaintDetailInner /></AuthGate></ScreenContainer>;
}
