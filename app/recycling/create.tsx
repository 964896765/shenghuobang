import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { ITEM_CATEGORIES } from "@/lib/labels";

function CreateRecyclingInner() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("家电");
  const [conditionDesc, setConditionDesc] = useState("");
  const [expectedPrice, setExpectedPrice] = useState("");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const createMut = trpc.recycling.create.useMutation({
    onSuccess: (res) => {
      utils.recycling.myRequests.invalidate();
      router.replace(`/recycling/${res.id}` as any);
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = () => {
    setError("");
    if (title.trim().length < 2) {
      setError("请填写物品名称(至少2个字)");
      return;
    }
    const priceNum = expectedPrice ? parseInt(expectedPrice, 10) : null;
    if (expectedPrice && (Number.isNaN(priceNum!) || priceNum! < 0)) {
      setError("期望价格格式不正确");
      return;
    }
    createMut.mutate({
      title: title.trim(),
      category,
      conditionDesc: conditionDesc.trim() || undefined,
      expectedPrice: priceNum,
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader title="发布回收询价" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View className="bg-primary/5 rounded-2xl p-4 border border-primary/20 mb-2">
          <Text className="text-sm text-foreground leading-5">
            发布回收询价后,附近的入驻回收商家会给出报价,你可以对比后选择,商家上门取件并当面结算。
          </Text>
        </View>

        <FieldLabel label="物品名称" required />
        <AppTextInput placeholder="如:旧洗衣机、废旧空调、旧冰箱" value={title} onChangeText={setTitle} maxLength={50} />

        <FieldLabel label="分类" />
        <ChipSelector options={ITEM_CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />

        <FieldLabel label="状况描述(选填)" />
        <AppTextInput
          placeholder="使用年限、是否能正常工作、大概尺寸重量等,描述越详细报价越准"
          value={conditionDesc}
          onChangeText={setConditionDesc}
          multiline
          maxLength={1000}
        />

        <FieldLabel label="期望价格(元,选填)" />
        <AppTextInput placeholder="不填则由商家报价" value={expectedPrice} onChangeText={setExpectedPrice} keyboardType="numeric" />

        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

        <View className="mt-6">
          <PrimaryButton title="发布询价" onPress={handleSubmit} loading={createMut.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function CreateRecyclingScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <AuthGate title="登录后发布回收询价">
        <CreateRecyclingInner />
      </AuthGate>
    </ScreenContainer>
  );
}
