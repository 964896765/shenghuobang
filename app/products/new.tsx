import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { productErrorMessage, StableProductRequestIds } from "@/lib/product-app";
import { trpc } from "@/lib/trpc";

type ProductSourceType = "need" | "idea" | "funding_campaign";
type SourceOption = {
  id: number;
  type: ProductSourceType;
  title: string;
  summary: string;
  status: string;
};

function parseSourceType(value: string | undefined): ProductSourceType {
  if (value === "idea" || value === "funding_campaign") return value;
  return "need";
}

function sourceTypeLabel(type: ProductSourceType): string {
  if (type === "need") return "需求";
  if (type === "idea") return "创意";
  return "成功筹措";
}

function parseSpecifications(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("规格参数必须是 JSON 对象，例如：{\"材质\":\"不锈钢\"}");
  return parsed as Record<string, unknown>;
}

function NewProductModelContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceType?: string; sourceId?: string }>();
  const presetSourceId = Number(params.sourceId);
  const requests = useRef(new StableProductRequestIds()).current;
  const utils = trpc.useUtils();
  const needs = trpc.needs.list.useQuery({ scope: "mine" });
  const ideas = trpc.ideas.listMine.useQuery({ limit: 50 });
  const campaigns = trpc.fundingCampaigns.myList.useQuery();
  const createMutation = trpc.productModels.create.useMutation();
  const publishMutation = trpc.productModels.publish.useMutation();
  const [sourceType, setSourceType] = useState<ProductSourceType>(parseSourceType(params.sourceType));
  const [sourceId, setSourceId] = useState<number | null>(Number.isSafeInteger(presetSourceId) && presetSourceId > 0 ? presetSourceId : null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelCode, setModelCode] = useState("");
  const [versionLabel, setVersionLabel] = useState("v1");
  const [specifications, setSpecifications] = useState("");
  const [visibility, setVisibility] = useState<"public" | "owner_only" | "restricted">("public");
  const [error, setError] = useState("");

  const sourceOptions = useMemo<SourceOption[]>(() => {
    if (sourceType === "need") {
      return (needs.data ?? []).map((item) => ({
        id: item.id,
        type: "need" as const,
        title: item.title,
        summary: item.originalDescription ?? "暂无详细描述",
        status: item.status,
      }));
    }
    if (sourceType === "idea") {
      return (ideas.data ?? []).map((item) => ({
        id: item.id,
        type: "idea" as const,
        title: item.title || "未命名创意",
        summary: item.summary || "暂无简介",
        status: item.status || "draft",
      }));
    }
    return (campaigns.data ?? [])
      .filter((item) => item.status === "succeeded")
      .map((item) => ({
        id: item.id,
        type: "funding_campaign" as const,
        title: item.title,
        summary: item.summary,
        status: item.status,
      }));
  }, [campaigns.data, ideas.data, needs.data, sourceType]);

  const selectedSource = sourceOptions.find((item) => item.id === sourceId) ?? null;
  const busy = createMutation.isPending || publishMutation.isPending;

  const selectSource = (option: SourceOption) => {
    setSourceId(option.id);
    if (!name.trim()) setName(option.title);
    if (!summary.trim()) setSummary(option.summary.slice(0, 500));
  };

  const submit = async (publishNow: boolean) => {
    if (!sourceId) return setError("请选择一个可追溯的需求、创意或成功筹措活动。" );
    if (name.trim().length < 2) return setError("请填写产品名称。" );
    if (summary.trim().length < 5) return setError("请补充一句话产品简介。" );
    if (!categoryCode.trim()) return setError("请填写产品分类。" );
    try {
      const operation = `create-${sourceType}-${sourceId}`;
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        summary: summary.trim(),
        description: description.trim() || undefined,
        categoryCode: categoryCode.trim(),
        brandName: brandName.trim() || undefined,
        modelCode: modelCode.trim() || undefined,
        versionLabel: versionLabel.trim() || undefined,
        specifications: parseSpecifications(specifications),
        visibility,
        sourceLinks: [{ sourceType, sourceId, relationType: "derived_from" }],
        requestId: requests.get(operation),
      });
      requests.complete(operation);
      let model = created.model;
      if (publishNow) {
        const publishOperation = `publish-${model.id}`;
        const published = await publishMutation.mutateAsync({
          productModelId: model.id,
          expectedAuthorizationVersion: model.authorizationVersion,
          requestId: requests.get(publishOperation),
        });
        requests.complete(publishOperation);
        model = published.model;
      }
      await Promise.all([
        utils.productModels.myList.invalidate(),
        utils.productModels.publicList.invalidate(),
      ]);
      setError("");
      router.replace(`/products/manage/${model.id}` as never);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("规格参数") ? cause.message : productErrorMessage(cause));
    }
  };

  if (needs.isLoading || ideas.isLoading || campaigns.isLoading) return <LoadingView text="正在加载可追溯来源…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-4">
          <Text className="text-base font-bold text-foreground">先建立来源链，再定义产品身份</Text>
          <Text className="text-sm text-muted leading-6 mt-2">每个产品型号至少连接一项已授权来源。产品型号和实体单件分别建模，单件护照事件不可静默覆盖。</Text>
        </View>

        <FieldLabel label="来源类型" required />
        <View className="flex-row flex-wrap gap-2 mb-3">
          {(["need", "idea", "funding_campaign"] as const).map((type) => (
            <Pressable key={type} onPress={() => { setSourceType(type); setSourceId(null); }} className={sourceType === type ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}>
              <Text className={sourceType === type ? "text-white font-semibold" : "text-foreground"}>{sourceTypeLabel(type)}</Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel label={`选择我的${sourceTypeLabel(sourceType)}来源`} required />
        {sourceOptions.length === 0 ? (
          <View className="bg-surface border border-border rounded-2xl p-4 mb-4">
            <Text className="text-sm text-muted">暂无可用来源。需求、创意需先创建；筹措来源仅展示已成功活动。</Text>
          </View>
        ) : sourceOptions.map((option) => (
          <Pressable key={`${option.type}-${option.id}`} onPress={() => selectSource(option)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
            <View className={sourceId === option.id ? "bg-primary/10 border border-primary rounded-2xl p-4 mb-2" : "bg-surface border border-border rounded-2xl p-4 mb-2"}>
              <View className="flex-row items-center justify-between gap-3"><Text className="text-base font-semibold text-foreground flex-1" numberOfLines={1}>{option.title}</Text><StatusBadge label={option.status} tone="gray" small /></View>
              <Text className="text-sm text-muted mt-2" numberOfLines={2}>{option.summary}</Text>
            </View>
          </Pressable>
        ))}
        {selectedSource ? <Text className="text-xs text-primary mb-3">已选择：{selectedSource.title}</Text> : null}

        <FieldLabel label="产品名称" required />
        <AppTextInput value={name} onChangeText={setName} placeholder="为产品型号命名" />
        <FieldLabel label="一句话简介" required />
        <AppTextInput value={summary} onChangeText={setSummary} placeholder="说明产品解决的问题和目标用户" multiline />
        <FieldLabel label="产品说明" />
        <AppTextInput value={description} onChangeText={setDescription} placeholder="说明功能、边界、生产或验证状态" multiline />
        <FieldLabel label="产品分类" required />
        <AppTextInput value={categoryCode} onChangeText={setCategoryCode} placeholder="如：家居工具" />
        <FieldLabel label="品牌（可选）" />
        <AppTextInput value={brandName} onChangeText={setBrandName} placeholder="如：生活帮实验室" />
        <FieldLabel label="型号（可选）" />
        <AppTextInput value={modelCode} onChangeText={setModelCode} placeholder="如：LB-HOME-001" />
        <FieldLabel label="版本标签" />
        <AppTextInput value={versionLabel} onChangeText={setVersionLabel} placeholder="如：v1" />
        <FieldLabel label="公开规格 JSON（可选）" />
        <AppTextInput value={specifications} onChangeText={setSpecifications} placeholder='例如：{"材质":"不锈钢","容量":"500ml"}' multiline autoCapitalize="none" />

        <FieldLabel label="型号可见范围" required />
        <View className="flex-row flex-wrap gap-2 mb-4">
          {([
            ["public", "公开"],
            ["owner_only", "仅所有者"],
            ["restricted", "受限"],
          ] as const).map(([value, label]) => (
            <Pressable key={value} onPress={() => setVisibility(value)} className={visibility === value ? "bg-primary rounded-full px-4 py-2" : "bg-surface border border-border rounded-full px-4 py-2"}>
              <Text className={visibility === value ? "text-white font-semibold" : "text-foreground"}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}
        <View className="flex-row gap-3 mt-5">
          <View className="flex-1"><PrimaryButton title="保存草稿" variant="outline" disabled={busy} loading={createMutation.isPending && !publishMutation.isPending} onPress={() => void submit(false)} /></View>
          <View className="flex-1"><PrimaryButton title="保存并发布" disabled={busy} loading={busy} onPress={() => void submit(true)} /></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function NewProductModelScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="创建产品型号" />
      <AuthGate title="登录后创建产品型号"><NewProductModelContent /></AuthGate>
    </ScreenContainer>
  );
}
