import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ErrorState, FieldLabel, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage, StableProductRequestIds, type ProductTrustLevel } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

function parseDetail(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("补充信息必须是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

function RegisterProductUnitContent({ modelId }: { modelId: number }) {
  const router = useRouter();
  const requests = useRef(new StableProductRequestIds()).current;
  const detail = trpc.productModels.detail.useQuery({ productModelId: modelId });
  const register = trpc.productUnits.register.useMutation();
  const [serialNumber, setSerialNumber] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [initialStatus, setInitialStatus] = useState<"registered" | "manufactured">("registered");
  const [trustLevel, setTrustLevel] = useState<ProductTrustLevel>("self_declared");
  const [passportVisibility, setPassportVisibility] = useState<"public" | "owner_only" | "restricted">("owner_only");
  const [detailJson, setDetailJson] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      const operation = `register-${modelId}-${serialNumber.trim() || batchCode.trim() || "unit"}`;
      const result = await register.mutateAsync({
        productModelId: modelId,
        serialNumber: serialNumber.trim() || undefined,
        batchCode: batchCode.trim() || undefined,
        initialStatus,
        trustLevel,
        passportVisibility,
        detail: parseDetail(detailJson),
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      setError("");
      router.replace(`/products/passport/owner/${result.unit.id}` as never);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("补充信息") ? cause.message : productErrorMessage(cause));
    }
  };

  if (detail.isLoading) return <LoadingView text="正在加载产品型号…" />;
  if (detail.isError || !detail.data) return <ErrorState title="无法加载产品型号" hint={productErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />;
  const model = detail.data.model;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-base font-bold text-foreground">为实体单件建立独立身份</Text>
          <Text className="text-sm text-muted leading-6 mt-2">型号“{model.name}”与单件分离。登记后会追加一条不可静默覆盖的初始护照事件，并生成公开查询码。</Text>
        </View>

        <FieldLabel label="序列号（可选）" />
        <AppTextInput value={serialNumber} onChangeText={setSerialNumber} placeholder="生产序列号或设备编号" autoCapitalize="characters" />
        <FieldLabel label="批次号（可选）" />
        <AppTextInput value={batchCode} onChangeText={setBatchCode} placeholder="如：2026Q3-A" autoCapitalize="characters" />
        <FieldLabel label="初始状态" required />
        <View className="flex-row gap-2 mb-4">
          {(["registered", "manufactured"] as const).map((value) => <Pressable key={value} onPress={() => setInitialStatus(value)} className={initialStatus === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}><Text className={initialStatus === value ? "text-white font-semibold" : "text-foreground"}>{value === "registered" ? "已登记" : "已生产"}</Text></Pressable>)}
        </View>
        <FieldLabel label="信任等级" required />
        <View className="flex-row flex-wrap gap-2 mb-4">
          {([
            ["self_declared", "自主声明"],
            ["verified", "已核验"],
            ["certified", "已认证"],
          ] as const).map(([value, label]) => <Pressable key={value} onPress={() => setTrustLevel(value)} className={trustLevel === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}><Text className={trustLevel === value ? "text-white font-semibold" : "text-foreground"}>{label}</Text></Pressable>)}
        </View>
        <FieldLabel label="公开护照范围" required />
        <View className="flex-row flex-wrap gap-2 mb-4">
          {([
            ["public", "公开"],
            ["owner_only", "仅所有者"],
            ["restricted", "受限"],
          ] as const).map(([value, label]) => <Pressable key={value} onPress={() => setPassportVisibility(value)} className={passportVisibility === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}><Text className={passportVisibility === value ? "text-white font-semibold" : "text-foreground"}>{label}</Text></Pressable>)}
        </View>
        <FieldLabel label="初始事件补充信息 JSON（可选）" />
        <AppTextInput value={detailJson} onChangeText={setDetailJson} placeholder='例如：{"生产地点":"苏州","质检批次":"QC-01"}' multiline autoCapitalize="none" />
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        <View className="mt-5"><PrimaryButton title="登记产品单件并生成护照" loading={register.isPending} disabled={register.isPending} onPress={() => void submit()} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function RegisterProductUnitScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const modelId = Number(params.id);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="登记产品单件" />
      {Number.isSafeInteger(modelId) && modelId > 0 ? <AuthGate title="登录后登记产品单件"><RegisterProductUnitContent modelId={modelId} /></AuthGate> : <ErrorState title="产品型号参数无效" />}
    </ScreenContainer>
  );
}
