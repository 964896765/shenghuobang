import { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";

type VerificationType = "identity" | "engineer" | "merchant";

async function readBase64(uri: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function statusTone(status: string) {
  if (status === "approved") return "green" as const;
  if (["rejected", "revoked", "expired"].includes(status)) return "red" as const;
  if (status === "additional_info_required") return "orange" as const;
  return "blue" as const;
}

function VerificationCenterInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const mine = trpc.verifications.mine.useQuery();
  const modernMine = trpc.certification.mine.useQuery();
  const [realName, setRealName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [uploadType, setUploadType] = useState<VerificationType>("identity");
  const [error, setError] = useState("");
  const submitIdentity = trpc.certification.submitIdentity.useMutation({
    onSuccess: async () => { setIdNumber(""); await Promise.all([utils.certification.invalidate(), utils.identity.invalidate(), utils.workspace.invalidate(), utils.verifications.mine.invalidate()]); },
    onError: (e) => setError(e.message),
  });
  const upload = trpc.certification.uploadDocument.useMutation({
    onSuccess: async () => { setError(""); await utils.certification.invalidate(); }, onError: (e) => setError(e.message),
  });

  if (mine.isLoading || modernMine.isLoading) return <LoadingView />;
  if (!mine.data || modernMine.isError) return <EmptyState title="暂时无法读取认证状态" hint={modernMine.error?.message} actionTitle="重试" onAction={() => { mine.refetch(); modernMine.refetch(); }} />;
  const displayRecord = (code: string, legacy: { id: number; status: string; rejectReason?: string | null } | null) => {
    const current = modernMine.data?.find((item) => item.typeCode === code);
    return current ? { id: current.id, status: current.status, rejectReason: current.decisionReasonCode } : legacy;
  };
  const records = [
    { type: "identity" as const, label: "实名认证", record: displayRecord("real_name", mine.data.identity) },
    { type: "engineer" as const, label: "工程师认证", record: displayRecord("engineer_basic", mine.data.engineer) },
    { type: "merchant" as const, label: "商家认证", record: displayRecord("merchant_business_license", mine.data.merchant) },
  ];
  const selectedRecord = records.find((item) => item.type === uploadType)?.record;

  const pickDocument = async () => {
    try {
      setError("");
      if (!selectedRecord) throw new Error("请先提交对应认证申请");
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 8 * 1024 * 1024) throw new Error("单个证明文件不能超过 8MB");
      upload.mutate({
        certificationId: selectedRecord.id, documentType: "supporting_document",
        fileName: asset.name, mimeType: asset.mimeType ?? undefined, base64Data: await readBase64(asset.uri),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取证明文件失败");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
      {records.map(({ type, label, record }) => (
        <View key={type} className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">{label}</Text>
            <StatusBadge label={record?.status ?? "未提交"} tone={record ? statusTone(record.status) : "gray"} />
          </View>
          {record?.rejectReason ? <Text className="text-sm text-error mt-2 leading-5">审核说明：{record.rejectReason}</Text> : null}
          {type === "engineer" && record?.status !== "approved" ? <View className="mt-3"><PrimaryButton small variant="outline" title={record ? "补充/重新提交工程师资料" : "提交工程师认证"} onPress={() => router.push("/engineer-apply" as never)} /></View> : null}
          {type === "merchant" && record?.status !== "approved" ? <View className="mt-3"><PrimaryButton small variant="outline" title={record ? "补充/重新提交商家资料" : "提交商家认证"} onPress={() => router.push("/merchant-apply" as never)} /></View> : null}
        </View>
      ))}

      {(!records[0].record || ["additional_info_required", "rejected", "draft", "revoked", "expired"].includes(records[0].record.status)) ? (
        <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
          <Text className="text-base font-semibold text-foreground">提交实名认证</Text>
          <Text className="text-xs text-muted mt-1">证件号码只保存摘要和末四位，不写入审计日志。</Text>
          <FieldLabel label="真实姓名" required />
          <AppTextInput value={realName} onChangeText={setRealName} placeholder="请输入真实姓名" />
          <FieldLabel label="证件号码" required />
          <AppTextInput value={idNumber} onChangeText={setIdNumber} placeholder="请输入证件号码" />
          <View className="mt-3"><PrimaryButton title="提交人工审核" loading={submitIdentity.isPending} disabled={realName.trim().length < 2 || idNumber.trim().length < 6} onPress={() => submitIdentity.mutate({ realName: realName.trim(), idType: "cn_id", idNumber: idNumber.trim() })} /></View>
        </View>
      ) : null}

      <View className="bg-surface border border-border rounded-2xl p-4">
        <Text className="text-base font-semibold text-foreground">上传证明资料</Text>
        <View className="flex-row gap-2 mt-3">
          {records.map((item) => <View key={item.type} className="flex-1"><PrimaryButton small variant={uploadType === item.type ? "primary" : "outline"} title={item.label.replace("认证", "")} onPress={() => setUploadType(item.type)} /></View>)}
        </View>
        <View className="mt-3"><PrimaryButton title="选择并上传文件" variant="outline" loading={upload.isPending} disabled={!selectedRecord} onPress={pickDocument} /></View>
        <Text className="text-xs text-muted mt-2">敏感文件不提供永久公开地址；用户和有权限的审核员通过短时签名访问。</Text>
      </View>
      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
    </ScrollView>
  );
}

export default function VerificationCenterScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="认证中心" /><AuthGate title="登录后管理认证"><VerificationCenterInner /></AuthGate></ScreenContainer>;
}
