import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { trpc } from "@/lib/trpc";

const TYPES = [
  { value: "delivery_quality", label: "交付质量不合格" },
  { value: "project_delay", label: "项目延期" },
  { value: "requirement_dispute", label: "需求范围争议" },
  { value: "malicious_rejection", label: "恶意拒绝验收" },
  { value: "ip_conflict", label: "知识产权问题" },
  { value: "other", label: "其他" },
] as const;
type ComplaintType = (typeof TYPES)[number]["value"];

function ComplaintCreateInner() {
  const params = useLocalSearchParams<{ projectId?: string; milestoneId?: string }>();
  const router = useRouter();
  const projectId = params.projectId ? Number(params.projectId) : undefined;
  const milestoneId = params.milestoneId ? Number(params.milestoneId) : undefined;
  const [complaintType, setComplaintType] = useState<ComplaintType>("delivery_quality");
  const [description, setDescription] = useState("");
  const [expectedResolution, setExpectedResolution] = useState("");
  const [error, setError] = useState("");
  const create = trpc.complaints.create.useMutation({
    onSuccess: (res) => router.replace(`/complaints/${res.id}` as any),
    onError: (e) => setError(e.message),
  });

  const relatedType = milestoneId ? "milestone" as const : "project" as const;
  const relatedId = milestoneId ?? projectId;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        <View className="bg-error/5 rounded-2xl border border-error/20 p-4">
          <Text className="text-sm font-semibold text-error">提交后将进入争议状态</Text>
          <Text className="text-sm text-foreground mt-1 leading-5">平台会保留当前项目、里程碑、聊天和文件记录。投诉不是普通聊天，请如实说明并提交可核验的信息。</Text>
        </View>
        <FieldLabel label="投诉类型" required />
        <ChipSelector options={[...TYPES]} value={complaintType} onChange={setComplaintType} />
        <FieldLabel label="事件说明" required />
        <AppTextInput value={description} onChangeText={setDescription} multiline placeholder="说明发生时间、原约定、实际情况及已经沟通的结果" />
        <FieldLabel label="期望处理方式" />
        <AppTextInput value={expectedResolution} onChangeText={setExpectedResolution} multiline placeholder="例如：重新交付、部分退款、恢复验收、平台介入判定" />
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        <View className="mt-5">
          <PrimaryButton
            title="提交投诉并保全记录"
            variant="danger"
            loading={create.isPending}
            disabled={!relatedId || description.trim().length < 5}
            onPress={() => relatedId && create.mutate({ relatedType, relatedId, complaintType, description: description.trim(), expectedResolution: expectedResolution.trim() || undefined })}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ComplaintCreateScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="发起投诉/争议" /><AuthGate title="登录后提交投诉"><ComplaintCreateInner /></AuthGate></ScreenContainer>;
}
