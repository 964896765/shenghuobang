import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import {
  AIHintBar,
  AppTextInput,
  ChipSelector,
  FieldLabel,
  PrimaryButton,
} from "@/components/common";
import { NEED_TYPES, NEED_CATEGORIES } from "@/lib/labels";

type Structured = {
  target?: string;
  scenario?: string;
  problem?: string;
  expectation?: string;
  budgetSuggestion?: string;
  recommendedProfession?: string;
  riskNotes?: string;
};

const STEPS = ["描述问题", "AI 整理", "补充信息", "发布确认"];

function StepIndicator({ step }: { step: number }) {
  return (
    <View className="flex-row items-center px-4 py-3">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <View className="items-center">
            <View
              className={
                i <= step ? "w-6 h-6 rounded-full bg-primary items-center justify-center" : "w-6 h-6 rounded-full bg-border items-center justify-center"
              }
            >
              <Text className={i <= step ? "text-white text-xs font-bold" : "text-muted text-xs"}>{i + 1}</Text>
            </View>
            <Text className={i === step ? "text-xs text-primary mt-1 font-medium" : "text-xs text-muted mt-1"}>{s}</Text>
          </View>
          {i < STEPS.length - 1 ? <View className={i < step ? "flex-1 h-0.5 bg-primary mx-1 mb-4" : "flex-1 h-0.5 bg-border mx-1 mb-4"} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function CreateNeedInner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; preset?: string }>();
  const [step, setStep] = useState(0);
  const [needId, setNeedId] = useState<number | null>(null);

  // Step 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(params.preset ?? "");
  const [needType, setNeedType] = useState(params.type ?? "life");
  const [cityName, setCityName] = useState("北京");
  const [isPublic, setIsPublic] = useState(true);

  // Step 2
  const [structured, setStructured] = useState<Structured>({});
  const [aiFailed, setAiFailed] = useState(false);
  const [aiConfirmed, setAiConfirmed] = useState(false);

  // Step 3
  const [category, setCategory] = useState<string>("其他");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [deadline, setDeadline] = useState("");
  const [supportsRemote, setSupportsRemote] = useState(true);
  const [requiresOnsite, setRequiresOnsite] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [allowQuotes, setAllowQuotes] = useState(true);

  const [error, setError] = useState("");

  const createNeed = trpc.needs.create.useMutation();
  const aiStructure = trpc.needs.aiStructure.useMutation();
  const updateNeed = trpc.needs.update.useMutation();
  const publishNeed = trpc.needs.publish.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (params.preset && !title) setTitle(params.preset.slice(0, 30));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStep1Next = async () => {
    setError("");
    if (title.trim().length < 2) {
      setError("请填写标题(至少2个字)");
      return;
    }
    if (description.trim().length < 5) {
      setError("请描述你遇到的问题(至少5个字)");
      return;
    }
    try {
      let id = needId;
      if (!id) {
        const res = await createNeed.mutateAsync({
          title: title.trim(),
          originalDescription: description.trim(),
          needType,
          cityName,
          visibility: isPublic ? "public" : "private",
        });
        id = res.id;
        setNeedId(id);
      } else {
        await updateNeed.mutateAsync({ id, title: title.trim(), originalDescription: description.trim() });
      }
      setStep(1);
      // 触发 AI 整理
      setAiFailed(false);
      try {
        const s = await aiStructure.mutateAsync({ id: id! });
        setStructured(s ?? {});
        if (!s || Object.keys(s).length === 0) setAiFailed(true);
      } catch {
        setAiFailed(true);
      }
    } catch (e: any) {
      setError(e.message ?? "创建失败,请重试");
    }
  };

  const handleStep2Next = async () => {
    setError("");
    if (!aiConfirmed) {
      setError("请确认AI整理的内容(或手动修改后确认)");
      return;
    }
    try {
      await updateNeed.mutateAsync({ id: needId!, structuredData: structured });
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? "保存失败,请重试");
    }
  };

  const handleStep3Next = async () => {
    setError("");
    const min = budgetMin ? parseInt(budgetMin, 10) : null;
    const max = budgetMax ? parseInt(budgetMax, 10) : null;
    if (min !== null && Number.isNaN(min)) {
      setError("预算下限格式不正确");
      return;
    }
    if (max !== null && Number.isNaN(max)) {
      setError("预算上限格式不正确");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError("预算下限不能大于上限");
      return;
    }
    try {
      await updateNeed.mutateAsync({
        id: needId!,
        category,
        budgetMin: min,
        budgetMax: max,
        expectedDeadline: deadline || undefined,
        supportsRemote,
        requiresOnsite,
        allowComments,
        allowQuotes,
      });
      setStep(3);
    } catch (e: any) {
      setError(e.message ?? "保存失败,请重试");
    }
  };

  const handlePublish = async () => {
    setError("");
    try {
      await publishNeed.mutateAsync({ id: needId! });
      utils.needs.list.invalidate();
      utils.home.feed.invalidate();
      router.replace(`/needs/${needId}` as any);
    } catch (e: any) {
      setError(e.message ?? "发布失败,请重试");
    }
  };

  const structuredFields: { key: keyof Structured; label: string; placeholder: string }[] = [
    { key: "target", label: "使用对象", placeholder: "谁会使用这个解决方案?" },
    { key: "scenario", label: "使用场景", placeholder: "在什么场景下使用?" },
    { key: "problem", label: "当前问题", placeholder: "现在遇到的核心问题" },
    { key: "expectation", label: "期望效果", placeholder: "希望达到什么效果?" },
    { key: "budgetSuggestion", label: "预算建议", placeholder: "AI 建议的预算范围" },
    { key: "recommendedProfession", label: "推荐专业方向", placeholder: "适合解决此问题的专业方向" },
    { key: "riskNotes", label: "风险提示", placeholder: "需要注意的风险" },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader title="发布生活需求" />
      <StepIndicator step={step} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View>
            <FieldLabel label="标题" required />
            <AppTextInput placeholder="用一句话描述你的问题" value={title} onChangeText={setTitle} maxLength={50} />
            <FieldLabel label="详细描述" required />
            <AppTextInput
              placeholder="请描述你遇到的问题、使用场景或想实现的效果。"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={3000}
            />
            <FieldLabel label="需求类型" />
            <ChipSelector options={NEED_TYPES} value={needType as any} onChange={(v) => setNeedType(v)} />
            <FieldLabel label="所在城市" />
            <AppTextInput placeholder="如:北京" value={cityName} onChangeText={setCityName} maxLength={20} />
            <View className="flex-row items-center justify-between mt-4 bg-surface rounded-xl border border-border px-4 py-3">
              <View className="flex-1 mr-3">
                <Text className="text-sm font-medium text-foreground">公开需求</Text>
                <Text className="text-xs text-muted mt-0.5">公开后附近工程师可以看到并响应;保密需求只展示有限信息</Text>
              </View>
              <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: "#16A34A" }} />
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            {aiStructure.isPending ? (
              <View className="items-center py-12">
                <Text className="text-base font-medium text-foreground">AI 正在整理你的需求…</Text>
                <Text className="text-sm text-muted mt-2">通常需要几秒钟</Text>
              </View>
            ) : (
              <View>
                <AIHintBar text={aiFailed ? "暂时无法自动整理,你可以继续手动填写。" : "以下内容由AI辅助整理,请确认后再发布。"} />
                {structuredFields.map((f) => (
                  <View key={f.key}>
                    <FieldLabel label={f.label} />
                    <AppTextInput
                      placeholder={f.placeholder}
                      value={structured[f.key] ?? ""}
                      onChangeText={(t) => setStructured((prev) => ({ ...prev, [f.key]: t }))}
                      multiline={f.key === "problem" || f.key === "expectation"}
                    />
                  </View>
                ))}
                <Pressable
                  onPress={() => setAiConfirmed(!aiConfirmed)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <View className="flex-row items-center mt-4 bg-surface rounded-xl border border-border px-4 py-3">
                    <View
                      className={
                        aiConfirmed
                          ? "w-5 h-5 rounded-md bg-primary items-center justify-center"
                          : "w-5 h-5 rounded-md border border-border bg-background"
                      }
                    >
                      {aiConfirmed ? <Text className="text-white text-xs font-bold">✓</Text> : null}
                    </View>
                    <Text className="text-sm text-foreground ml-2.5 flex-1">我已确认以上整理内容准确表达了我的需求</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <FieldLabel label="需求分类" />
            <ChipSelector
              options={NEED_CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={category}
              onChange={setCategory}
            />
            <FieldLabel label="预算区间(元)" />
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <AppTextInput placeholder="最低" value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" />
              </View>
              <Text className="text-muted">—</Text>
              <View className="flex-1">
                <AppTextInput placeholder="最高" value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" />
              </View>
            </View>
            <FieldLabel label="期望完成时间" />
            <AppTextInput placeholder="如:两周内 / 本月底前" value={deadline} onChangeText={setDeadline} />
            {[
              { label: "支持远程解决", value: supportsRemote, set: setSupportsRemote, hint: "问题可以通过线上沟通解决" },
              { label: "需要上门服务", value: requiresOnsite, set: setRequiresOnsite, hint: "需要工程师到现场处理" },
              { label: "允许讨论留言", value: allowComments, set: setAllowComments, hint: "其他用户可以在需求下留言" },
              { label: "允许工程师报价", value: allowQuotes, set: setAllowQuotes, hint: "认证工程师可以直接提交报价" },
            ].map((s) => (
              <View key={s.label} className="flex-row items-center justify-between mt-3 bg-surface rounded-xl border border-border px-4 py-3">
                <View className="flex-1 mr-3">
                  <Text className="text-sm font-medium text-foreground">{s.label}</Text>
                  <Text className="text-xs text-muted mt-0.5">{s.hint}</Text>
                </View>
                <Switch value={s.value} onValueChange={s.set} trackColor={{ true: "#16A34A" }} />
              </View>
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <View className="bg-surface rounded-2xl border border-border p-4">
              <Text className="text-lg font-bold text-foreground mb-1">{title}</Text>
              <Text className="text-sm text-muted leading-5 mb-3">{description}</Text>
              <View className="h-px bg-border my-2" />
              {structured.problem ? (
                <Text className="text-sm text-foreground leading-5 mb-1">核心问题:{structured.problem}</Text>
              ) : null}
              {structured.expectation ? (
                <Text className="text-sm text-foreground leading-5 mb-1">期望效果:{structured.expectation}</Text>
              ) : null}
              <Text className="text-sm text-foreground leading-5 mb-1">
                分类:{category} · 城市:{cityName} · {isPublic ? "公开需求" : "保密需求"}
              </Text>
              <Text className="text-sm text-foreground leading-5">
                预算:{budgetMin || budgetMax ? `¥${budgetMin || 0} - ¥${budgetMax || "不限"}` : "待定"}
                {deadline ? ` · 期望时间:${deadline}` : ""}
              </Text>
            </View>
            <Text className="text-xs text-muted mt-3 leading-4 px-1">
              发布后,附近工程师和平台将看到你的需求(保密需求仅展示有限信息)。发布即表示同意《平台服务规则》。
            </Text>
          </View>
        ) : null}

        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

        <View className="mt-6 flex-row gap-3">
          {step > 0 ? (
            <View className="flex-1">
              <PrimaryButton title="上一步" variant="muted" onPress={() => setStep(step - 1)} />
            </View>
          ) : null}
          <View className="flex-1">
            {step === 0 ? (
              <PrimaryButton title="下一步" onPress={handleStep1Next} loading={createNeed.isPending || updateNeed.isPending} />
            ) : step === 1 ? (
              <PrimaryButton title="确认,下一步" onPress={handleStep2Next} loading={updateNeed.isPending} disabled={aiStructure.isPending} />
            ) : step === 2 ? (
              <PrimaryButton title="下一步" onPress={handleStep3Next} loading={updateNeed.isPending} />
            ) : (
              <PrimaryButton title="确认发布" variant="action" onPress={handlePublish} loading={publishNeed.isPending} />
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function CreateNeedScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <AuthGate title="登录后发布需求">
        <CreateNeedInner />
      </AuthGate>
    </ScreenContainer>
  );
}
