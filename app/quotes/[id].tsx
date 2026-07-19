import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { formatTime } from "@/lib/labels";

function QuoteDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quoteId = Number(id);
  const utils = trpc.useUtils();
  const detail = trpc.quotes.detail.useQuery({ quoteId }, { enabled: Number.isFinite(quoteId) });
  const [showEdit, setShowEdit] = useState(false);
  const [error, setError] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [revisionCount, setRevisionCount] = useState("2");
  const [supportDays, setSupportDays] = useState("30");
  const [validDays, setValidDays] = useState("7");
  const [changeNote, setChangeNote] = useState("");

  const createVersion = trpc.quotes.createVersion.useMutation({
    onSuccess: () => {
      setShowEdit(false);
      setError("");
      utils.quotes.detail.invalidate({ quoteId });
      utils.needs.detail.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="报价不存在或无权查看" />;
  const { quote, need, versions, myRole } = detail.data;
  const current = versions[0];

  const openEdit = () => {
    setUnderstanding(current?.understanding ?? "");
    setTotalPrice(String(current?.totalPrice ?? quote.totalPrice));
    setDurationDays(String(current?.durationDays ?? quote.durationDays));
    setDeliverables(current?.deliverables ?? quote.deliverables);
    setExclusions(current?.exclusions ?? quote.exclusions ?? "");
    setPaymentTerms(current?.paymentTerms ?? quote.paymentTerms ?? "");
    setRevisionCount(String(current?.revisionCount ?? quote.revisionCount ?? 2));
    setSupportDays(String(current?.supportDays ?? quote.supportDays ?? 30));
    setValidDays(String(current?.validDays ?? quote.validDays ?? 7));
    setChangeNote("");
    setShowEdit(true);
  };

  const submit = () => {
    const price = Number(totalPrice);
    const days = Number(durationDays);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days <= 0) {
      setError("请填写有效报价和工期");
      return;
    }
    createVersion.mutate({
      quoteId,
      understanding: understanding.trim() || undefined,
      totalPrice: Math.round(price),
      durationDays: Math.round(days),
      deliverables: deliverables.trim(),
      exclusions: exclusions.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      revisionCount: Math.max(0, Number(revisionCount) || 0),
      supportDays: Math.max(0, Number(supportDays) || 0),
      validDays: Math.max(1, Number(validDays) || 7),
      changeNote: changeNote.trim(),
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <View className="flex-row items-center justify-between">
            <StatusBadge label={quote.status === "accepted" ? "已接受" : quote.status === "rejected" ? "已拒绝" : "报价中"} tone={quote.status === "accepted" ? "green" : quote.status === "rejected" ? "red" : "orange"} />
            <Text className="text-xs text-muted">当前 V{current?.versionNo ?? 1}</Text>
          </View>
          <Text className="text-lg font-bold text-foreground mt-3">{need.title}</Text>
          <Text className="text-2xl font-bold text-action mt-2">¥{current?.totalPrice ?? quote.totalPrice}</Text>
          <Text className="text-sm text-muted mt-1">预计 {current?.durationDays ?? quote.durationDays} 天完成</Text>
          {myRole === "engineer" && ["submitted", "viewed", "negotiating"].includes(quote.status) ? (
            <View className="mt-4"><PrimaryButton title="创建新报价版本" onPress={openEdit} /></View>
          ) : null}
        </View>

        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-base font-semibold text-foreground mb-3">版本历史</Text>
          {versions.map((v) => (
            <View key={v.id} className="border-b border-border pb-4 mb-4 last:border-b-0 last:mb-0 last:pb-0">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground">V{v.versionNo} · ¥{v.totalPrice}</Text>
                <Text className="text-xs text-muted">{formatTime(v.createdAt)}</Text>
              </View>
              {v.changeNote ? <Text className="text-xs text-primary mt-1">更新说明：{v.changeNote}</Text> : null}
              {v.understanding ? <Text className="text-sm text-foreground mt-2 leading-5">需求理解：{v.understanding}</Text> : null}
              <Text className="text-sm text-foreground mt-2 leading-5">交付内容：{v.deliverables}</Text>
              {v.exclusions ? <Text className="text-sm text-muted mt-1 leading-5">不包含：{v.exclusions}</Text> : null}
              {v.paymentTerms ? <Text className="text-sm text-muted mt-1">付款节点：{v.paymentTerms}</Text> : null}
              <Text className="text-xs text-muted mt-2">工期 {v.durationDays} 天 · 修改 {v.revisionCount} 次 · 售后 {v.supportDays} 天</Text>
            </View>
          ))}
        </View>

        {showEdit ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground">新报价版本</Text>
            <FieldLabel label="版本更新说明" required />
            <AppTextInput value={changeNote} onChangeText={setChangeNote} placeholder="说明本次修改了价格、工期或交付内容" />
            <FieldLabel label="需求理解" />
            <AppTextInput value={understanding} onChangeText={setUnderstanding} multiline />
            <FieldLabel label="总报价（元）" required />
            <AppTextInput value={totalPrice} onChangeText={setTotalPrice} keyboardType="numeric" />
            <FieldLabel label="工期（天）" required />
            <AppTextInput value={durationDays} onChangeText={setDurationDays} keyboardType="numeric" />
            <FieldLabel label="交付内容" required />
            <AppTextInput value={deliverables} onChangeText={setDeliverables} multiline />
            <FieldLabel label="不包含内容" />
            <AppTextInput value={exclusions} onChangeText={setExclusions} multiline />
            <FieldLabel label="付款节点" />
            <AppTextInput value={paymentTerms} onChangeText={setPaymentTerms} />
            <View className="flex-row gap-2">
              <View className="flex-1"><FieldLabel label="修改次数" /><AppTextInput value={revisionCount} onChangeText={setRevisionCount} keyboardType="numeric" /></View>
              <View className="flex-1"><FieldLabel label="售后天数" /><AppTextInput value={supportDays} onChangeText={setSupportDays} keyboardType="numeric" /></View>
              <View className="flex-1"><FieldLabel label="有效天数" /><AppTextInput value={validDays} onChangeText={setValidDays} keyboardType="numeric" /></View>
            </View>
            {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1"><PrimaryButton title="取消" variant="muted" onPress={() => setShowEdit(false)} /></View>
              <View className="flex-1"><PrimaryButton title="提交新版本" onPress={submit} loading={createVersion.isPending} disabled={changeNote.trim().length < 2 || deliverables.trim().length < 2} /></View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function QuoteDetailScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="报价版本" /><AuthGate title="登录后查看报价"><QuoteDetailInner /></AuthGate></ScreenContainer>;
}
