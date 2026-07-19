import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/lib/role-context";
import { AppTextInput, FieldLabel, PrimaryButton } from "@/components/common";

const MERCHANT_CATEGORIES = ["家电回收", "家具回收", "数码回收", "金属回收", "纸品回收", "综合回收", "维修服务", "搬家服务"];

function MerchantApplyInner() {
  const router = useRouter();
  const { refetchProfile } = useRole();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const applyMut = trpc.certification.submitMerchant.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.certification.invalidate(), utils.identity.invalidate(), utils.workspace.invalidate(), utils.profile.invalidate(), utils.organization.invalidate()]);
      refetchProfile();
      setDone(true);
    },
    onError: (e) => setError(e.message),
  });

  const toggleCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const handleSubmit = () => {
    setError("");
    if (!name.trim()) return setError("请填写商家名称");
    if (categories.length === 0) return setError("请至少选择一个经营类目");
    applyMut.mutate({
      merchantName: name.trim(),
      categories,
      description: description.trim(),
      addressText: addressText.trim() || undefined,
    });
  };

  if (done) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
          <Text className="text-white text-3xl">✓</Text>
        </View>
        <Text className="text-xl font-bold text-foreground mt-4">商家入驻申请已提交</Text>
        <Text className="text-sm text-muted text-center mt-2 leading-5">
          申请已进入人工审核。审核通过后，你可以在「我的」页切换到商家身份并接收附近的回收询价。
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
            入驻后可接收附近用户的回收询价并上门服务。提交后将由平台人工审核营业执照等资质。
          </Text>
        </View>

        <FieldLabel label="商家名称" required />
        <AppTextInput placeholder="如:绿色家园回收站" value={name} onChangeText={setName} maxLength={64} />

        <FieldLabel label="经营类目(可多选)" required />
        <View className="flex-row flex-wrap gap-2 mt-1">
          {MERCHANT_CATEGORIES.map((c) => {
            const selected = categories.includes(c);
            return (
              <Pressable key={c} onPress={() => toggleCategory(c)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View className={selected ? "bg-primary rounded-full px-3.5 py-1.5" : "bg-surface border border-border rounded-full px-3.5 py-1.5"}>
                  <Text className={selected ? "text-white text-sm" : "text-foreground text-sm"}>{c}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel label="商家介绍(选填)" />
        <AppTextInput placeholder="介绍你的服务范围、上门时间、结算方式等" value={description} onChangeText={setDescription} multiline maxLength={500} />

        <FieldLabel label="经营地址(选填)" />
        <AppTextInput placeholder="如:朝阳区望京街道xx号" value={addressText} onChangeText={setAddressText} maxLength={128} />

        {error ? <Text className="text-sm text-error mt-2">{error}</Text> : null}

        <View className="mt-5">
          <PrimaryButton title="提交入驻申请" onPress={handleSubmit} loading={applyMut.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function MerchantApplyScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="商家入驻" />
      <AuthGate title="登录后申请商家入驻">
        <MerchantApplyInner />
      </AuthGate>
    </ScreenContainer>
  );
}
