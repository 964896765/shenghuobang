import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/labels";

const STATUS_LABEL: Record<string, { label: string; tone: "gray" | "green" | "red" | "orange" | "blue" }> = {
  pending_confirmation: { label: "待对方确认", tone: "orange" },
  approved: { label: "已生效", tone: "green" },
  rejected: { label: "已拒绝", tone: "red" },
  withdrawn: { label: "已撤回", tone: "gray" },
  disputed: { label: "争议中", tone: "red" },
};

function ProjectChangesInner() {
  const { projectId: rawId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawId);
  const { user } = useAuth();
  const detail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [changeContent, setChangeContent] = useState("");
  const [reason, setReason] = useState("");
  const [amountDelta, setAmountDelta] = useState("0");
  const [scheduleDeltaDays, setScheduleDeltaDays] = useState("0");
  const [deliverableImpact, setDeliverableImpact] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [responseTarget, setResponseTarget] = useState<number | null>(null);
  const [error, setError] = useState("");

  const create = trpc.projects.createChange.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setTitle(""); setChangeContent(""); setReason(""); setAmountDelta("0"); setScheduleDeltaDays("0"); setDeliverableImpact(""); setError("");
      utils.projects.detail.invalidate({ id: projectId });
    },
    onError: (e) => setError(e.message),
  });
  const respond = trpc.projects.respondChange.useMutation({
    onSuccess: () => {
      setResponseTarget(null); setResponseNote(""); setError("");
      utils.projects.detail.invalidate({ id: projectId });
    },
    onError: (e) => setError(e.message),
  });
  const withdraw = trpc.projects.withdrawChange.useMutation({
    onSuccess: () => utils.projects.detail.invalidate({ id: projectId }),
    onError: (e) => setError(e.message),
  });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="项目不存在或无权查看" />;
  const { changes, project, profileMap } = detail.data;

  const submit = () => {
    create.mutate({
      projectId,
      title: title.trim(),
      changeContent: changeContent.trim(),
      reason: reason.trim() || undefined,
      amountDelta: Number(amountDelta) || 0,
      scheduleDeltaDays: Number(scheduleDeltaDays) || 0,
      deliverableImpact: deliverableImpact.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <Text className="text-base font-semibold text-foreground">{project.title}</Text>
          <Text className="text-sm text-muted mt-1">当前项目金额 ¥{project.totalAmount}</Text>
          <View className="mt-3"><PrimaryButton title={showCreate ? "收起变更表单" : "发起项目变更"} onPress={() => setShowCreate((v) => !v)} /></View>
        </View>

        {showCreate ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground">新建变更单</Text>
            <FieldLabel label="变更标题" required />
            <AppTextInput value={title} onChangeText={setTitle} placeholder="例如：增加自动避障功能" />
            <FieldLabel label="变更内容" required />
            <AppTextInput value={changeContent} onChangeText={setChangeContent} multiline placeholder="明确新增、删除或调整的功能和交付物" />
            <FieldLabel label="变更原因" />
            <AppTextInput value={reason} onChangeText={setReason} multiline />
            <View className="flex-row gap-3">
              <View className="flex-1"><FieldLabel label="金额变化（元）" /><AppTextInput value={amountDelta} onChangeText={setAmountDelta} keyboardType="numeric" placeholder="增加为正，减少为负" /></View>
              <View className="flex-1"><FieldLabel label="工期变化（天）" /><AppTextInput value={scheduleDeltaDays} onChangeText={setScheduleDeltaDays} keyboardType="numeric" /></View>
            </View>
            <FieldLabel label="交付物影响" />
            <AppTextInput value={deliverableImpact} onChangeText={setDeliverableImpact} multiline placeholder="说明新增或调整哪些文件、功能、测试和验收项" />
            {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
            <View className="mt-4"><PrimaryButton title="提交变更申请" onPress={submit} loading={create.isPending} disabled={title.trim().length < 2 || changeContent.trim().length < 2} /></View>
          </View>
        ) : null}

        <Text className="text-base font-semibold text-foreground mt-5 mb-3">变更记录 {changes.length}</Text>
        {changes.length === 0 ? <EmptyState title="暂无项目变更" hint="超出原需求范围的内容必须通过变更单确认，避免只在聊天中口头约定。" /> : changes.map((change) => {
          const st = STATUS_LABEL[change.status] ?? { label: change.status, tone: "gray" as const };
          const requesterName = profileMap[change.requesterId]?.nickname ?? (change.requesterId === project.ownerId ? "需求方" : "工程师");
          const canRespond = change.status === "pending_confirmation" && change.requesterId !== user?.id;
          const canWithdraw = change.status === "pending_confirmation" && change.requesterId === user?.id;
          return (
            <View key={change.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground flex-1">{change.title}</Text>
                <StatusBadge label={st.label} tone={st.tone} small />
              </View>
              <Text className="text-xs text-muted mt-1">{requesterName} · {formatTime(change.createdAt)}</Text>
              <Text className="text-sm text-foreground mt-3 leading-5">{change.changeContent}</Text>
              {change.reason ? <Text className="text-sm text-muted mt-2 leading-5">原因：{change.reason}</Text> : null}
              <View className="flex-row mt-3 gap-3">
                <Text className={change.amountDelta > 0 ? "text-sm text-error" : change.amountDelta < 0 ? "text-sm text-primary" : "text-sm text-muted"}>金额 {change.amountDelta >= 0 ? "+" : ""}{change.amountDelta} 元</Text>
                <Text className="text-sm text-muted">工期 {change.scheduleDeltaDays >= 0 ? "+" : ""}{change.scheduleDeltaDays} 天</Text>
              </View>
              {change.deliverableImpact ? <Text className="text-sm text-muted mt-2 leading-5">交付影响：{change.deliverableImpact}</Text> : null}
              {change.responseNote ? <Text className="text-sm text-foreground mt-2 leading-5">回复：{change.responseNote}</Text> : null}
              {canRespond ? (
                <View className="mt-3">
                  {responseTarget === change.id ? (
                    <>
                      <AppTextInput value={responseNote} onChangeText={setResponseNote} multiline placeholder="填写同意条件或拒绝原因" />
                      <View className="flex-row gap-2 mt-2">
                        <View className="flex-1"><PrimaryButton title="拒绝" variant="danger" small onPress={() => respond.mutate({ changeId: change.id, approve: false, responseNote: responseNote.trim() || undefined })} loading={respond.isPending} /></View>
                        <View className="flex-1"><PrimaryButton title="同意并生效" small onPress={() => respond.mutate({ changeId: change.id, approve: true, responseNote: responseNote.trim() || undefined })} loading={respond.isPending} /></View>
                      </View>
                    </>
                  ) : <PrimaryButton title="处理变更申请" variant="outline" small onPress={() => setResponseTarget(change.id)} />}
                </View>
              ) : null}
              {canWithdraw ? <View className="mt-3"><PrimaryButton title="撤回变更" variant="muted" small onPress={() => withdraw.mutate({ changeId: change.id })} loading={withdraw.isPending} /></View> : null}
            </View>
          );
        })}
        {error && !showCreate ? <Text className="text-sm text-error mt-2">{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ProjectChangesScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="项目变更" /><AuthGate title="登录后管理项目变更"><ProjectChangesInner /></AuthGate></ScreenContainer>;
}
