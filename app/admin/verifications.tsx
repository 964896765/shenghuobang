import { Linking, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/app";

type VerificationType = "identity" | "engineer" | "merchant";

export default function AdminVerificationsScreen() {
  const list = trpc.adminVerifications.pending.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<{ type: VerificationType; id: number } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const detail = trpc.adminVerifications.detail.useQuery(selected ?? { type: "identity", id: 0 }, { enabled: Boolean(selected) });
  const review = trpc.adminVerifications.review.useMutation({ onSuccess: () => { setSelected(null); setReason(""); utils.adminVerifications.pending.invalidate(); }, onError: (e) => setError(e.message) });
  const openDocument = async (documentId: number) => {
    try {
      const access = await utils.client.adminVerifications.documentAccess.query({ documentId });
      await Linking.openURL(`${getApiBaseUrl()}${access.path}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法打开文件"); }
  };
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="认证审核" /><AuthGate title="审核员登录后访问">
      {list.isLoading ? <LoadingView /> : !list.data ? <EmptyState title="无权访问" /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
          {list.data.items.map(({ type, item }) => <View key={`${type}-${item.id}`} className="bg-surface border border-border rounded-2xl p-4 mb-3">
            <View className="flex-row justify-between"><Text className="font-semibold text-foreground">{type} #{item.id} · 用户 #{item.userId}</Text><StatusBadge label={item.status} tone="orange" /></View>
            <View className="mt-3"><PrimaryButton small variant="outline" title="查看详情并审核" onPress={() => setSelected({ type, id: item.id })} /></View>
          </View>)}
          {selected && detail.data ? <View className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <Text className="text-base font-bold text-foreground">申请详情 #{selected.id}</Text>
            <Text className="text-sm text-muted mt-2">状态：{detail.data.record.status} · 资料 {detail.data.documents.length} 份</Text>
            {detail.data.documents.map((document) => <View key={document.id} className="mt-2"><PrimaryButton small variant="outline" title={`查看：${document.fileName}`} onPress={() => openDocument(document.id)} /></View>)}
            <AppTextInput value={reason} onChangeText={setReason} multiline placeholder="退回/拒绝时必须填写审核原因" />
            <View className="mt-3"><PrimaryButton title="审核通过" loading={review.isPending} onPress={() => review.mutate({ ...selected, action: "approve" })} /></View>
            <View className="mt-2"><PrimaryButton variant="outline" title="退回补充" loading={review.isPending} onPress={() => review.mutate({ ...selected, action: "request_info", reason })} /></View>
            <View className="mt-2"><PrimaryButton variant="danger" title="拒绝" loading={review.isPending} onPress={() => review.mutate({ ...selected, action: "reject", reason })} /></View>
          </View> : null}
          {error ? <Text className="text-error mt-3">{error}</Text> : null}
        </ScrollView>
      )}
    </AuthGate></ScreenContainer>
  );
}
