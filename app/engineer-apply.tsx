import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/role-context";
import { AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { ENGINEER_CATEGORIES } from "@/lib/labels";

const SKILL_SUGGESTIONS = [
  "家电维修", "水电改造", "APP开发", "小程序", "网站开发", "嵌入式", "PCB设计",
  "3D建模", "结构设计", "工业设计", "智能家居", "自动化控制", "数据分析", "UI设计",
];

function EngineerApplyInner() {
  const router = useRouter();
  const { refetchProfile } = useRole();
  const utils = trpc.useUtils();
  const [realName, setRealName] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [primaryCategory, setPrimaryCategory] = useState("软件开发");
  const [years, setYears] = useState("3");
  const [introduction, setIntroduction] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [startingPrice, setStartingPrice] = useState("");
  const [supportsRemote, setSupportsRemote] = useState(true);
  const [supportsOnsite, setSupportsOnsite] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const applyMut = trpc.certification.submitEngineer.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.certification.invalidate(), utils.identity.invalidate(), utils.workspace.invalidate(), utils.profile.invalidate()]);
      refetchProfile();
      setDone(true);
    },
    onError: (e) => setError(e.message),
  });

  const toggleSkill = (s: string) => {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length >= 8 ? prev : [...prev, s]));
  };

  const handleSubmit = () => {
    setError("");
    if (!realName.trim()) return setError("请填写真实姓名");
    if (!professionalTitle.trim()) return setError("请填写职业头衔,如\"资深家电维修技师\"");
    if (introduction.trim().length < 10) return setError("请填写至少10字的自我介绍");
    applyMut.mutate({
      realName: realName.trim(),
      professionalTitle: professionalTitle.trim(),
      primaryCategory,
      yearsOfExperience: parseInt(years, 10) || 0,
      introduction: introduction.trim(),
      skills,
      startingPrice: parseInt(startingPrice, 10) || 0,
      supportsRemote,
      supportsOnsite,
    });
  };

  if (done) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
          <Text className="text-white text-3xl">✓</Text>
        </View>
        <Text className="text-xl font-bold text-foreground mt-4">认证申请已提交</Text>
        <Text className="text-sm text-muted text-center mt-2 leading-5">
          申请已进入人工审核。审核通过后，你可以在「我的」页切换到工程师身份并前往需求大厅接单。
        </Text>
        <View className="w-full mt-6">
          <PrimaryButton title="返回我的" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/5 rounded-2xl p-4 border border-primary/20 mb-2">
          <Text className="text-sm text-foreground leading-5">
            完成基础认证后即可接收需求、提交报价。提交后将由平台人工审核资质材料。
          </Text>
        </View>

        <FieldLabel label="真实姓名" required />
        <AppTextInput placeholder="用于实名认证,不对外公开" value={realName} onChangeText={setRealName} maxLength={32} />

        <FieldLabel label="职业头衔" required />
        <AppTextInput placeholder="如:资深家电维修技师 / 全栈开发工程师" value={professionalTitle} onChangeText={setProfessionalTitle} maxLength={64} />

        <FieldLabel label="专业方向" required />
        <ChipSelector options={ENGINEER_CATEGORIES.map((c) => ({ value: c, label: c }))} value={primaryCategory} onChange={setPrimaryCategory} />

        <FieldLabel label="从业年限" />
        <AppTextInput placeholder="如:5" value={years} onChangeText={setYears} keyboardType="numeric" />

        <FieldLabel label="自我介绍" required />
        <AppTextInput
          placeholder="介绍你的专业背景、擅长领域、代表项目等(至少10字)"
          value={introduction}
          onChangeText={setIntroduction}
          multiline
          maxLength={1000}
        />

        <FieldLabel label={`技能标签(已选 ${skills.length}/8)`} />
        <View className="flex-row flex-wrap gap-2 mt-1">
          {SKILL_SUGGESTIONS.map((s) => {
            const selected = skills.includes(s);
            return (
              <Pressable key={s} onPress={() => toggleSkill(s)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className={selected ? "bg-primary rounded-full px-3.5 py-1.5" : "bg-surface border border-border rounded-full px-3.5 py-1.5"}>
                  <Text className={selected ? "text-white text-sm" : "text-foreground text-sm"}>{s}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel label="起步价(元,选填)" />
        <AppTextInput placeholder="最低服务价格,如:100" value={startingPrice} onChangeText={setStartingPrice} keyboardType="numeric" />

        <View className="flex-row items-center justify-between py-3 mt-2">
          <Text className="text-sm text-foreground">支持远程服务</Text>
          <Switch value={supportsRemote} onValueChange={setSupportsRemote} />
        </View>
        <View className="flex-row items-center justify-between py-3 border-t border-border">
          <Text className="text-sm text-foreground">支持上门服务</Text>
          <Switch value={supportsOnsite} onValueChange={setSupportsOnsite} />
        </View>

        {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}

        <View className="mt-5">
          <PrimaryButton title="提交认证申请" onPress={handleSubmit} loading={applyMut.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function EngineerApplyScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="工程师认证" />
      <AuthGate title="登录后申请工程师认证">
        <EngineerApplyInner />
      </AuthGate>
    </ScreenContainer>
  );
}
