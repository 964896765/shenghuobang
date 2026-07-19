import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EmptyState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { formatTime } from "@/lib/labels";

export default function AuditLogsScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = trpc.auditLogs.list.useQuery({ limit: 100 });
  const detail = trpc.auditLogs.detail.useQuery({ id: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="审计日志" /><AuthGate title="有权限的管理员登录后访问">
    {list.isLoading ? <LoadingView /> : !list.data ? <EmptyState title="无权访问" /> : <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      {list.data.map((log) => <View key={log.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
        <View className="flex-row justify-between"><Text className="font-semibold text-foreground">{log.action}</Text><StatusBadge label={log.riskLevel} tone={log.riskLevel === "high" ? "red" : log.riskLevel === "sensitive" ? "orange" : "gray"} /></View>
        <Text className="text-xs text-muted mt-2">{log.actorRole} #{log.actorId ?? "system"} · {log.resourceType} #{log.resourceId ?? "-"}</Text>
        <Text className="text-xs text-muted mt-1">{formatTime(log.createdAt)}</Text>
        <View className="mt-2"><PrimaryButton small variant="outline" title="查看详情" onPress={() => setSelectedId(log.id)} /></View>
      </View>)}
      {detail.data ? <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4"><Text className="text-base font-bold text-foreground">日志 #{detail.data.id}</Text><Text className="text-sm text-foreground mt-2">结果：{detail.data.result}</Text><Text className="text-xs text-muted mt-2" selectable>{JSON.stringify(detail.data.detail ?? {}, null, 2)}</Text></View> : null}
    </ScrollView>}
  </AuthGate></ScreenContainer>;
}
