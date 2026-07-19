import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { ListingImagePicker } from "@/components/listing-images";
import { CONDITION_LEVELS, FUNCTION_STATUSES, ITEM_CATEGORIES, LISTING_MODES } from "@/lib/labels";
import { type ListingFormValues, type ListingMode, validateListingForm } from "@/lib/listing-form";
import type { ListingImageDraft } from "@/lib/listing-images";

const GIVEAWAY_RULES = [
  { value: "first_come", label: "先到先得" },
  { value: "apply", label: "申请制" },
  { value: "choose", label: "我来挑选" },
] as const;

export const EMPTY_LISTING_FORM: ListingFormValues = {
  title: "",
  category: ITEM_CATEGORIES[0],
  brand: "",
  conditionLevel: CONDITION_LEVELS[0],
  functionStatus: FUNCTION_STATUSES[0],
  description: "",
  cityName: "北京",
  modes: ["fixed_price"],
  primaryMode: "fixed_price",
  price: "",
  minAcceptPrice: "",
  swapIntent: "",
  giveawayRule: "apply",
};

export function ListingForm({
  initialValues,
  initialImages = [],
  submitting,
  uploadProgress,
  submitTitle = "发布物品",
  secondaryTitle,
  error,
  onError,
  onSubmit,
  onSecondary,
  onDirtyChange,
}: {
  initialValues: ListingFormValues;
  initialImages?: ListingImageDraft[];
  submitting: boolean;
  uploadProgress?: string;
  submitTitle?: string;
  secondaryTitle?: string;
  error?: string;
  onError: (message: string) => void;
  onSubmit: (values: ListingFormValues, images: ListingImageDraft[]) => void;
  onSecondary?: (values: ListingFormValues, images: ListingImageDraft[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [images, setImages] = useState(initialImages);
  const initialSnapshot = useMemo(() => JSON.stringify({ initialValues, initialImages: initialImages.map((image) => image.key) }), [initialImages, initialValues]);
  const dirty = JSON.stringify({ initialValues: values, initialImages: images.map((image) => image.key) }) !== initialSnapshot;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const set = <K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) => {
    onError("");
    setValues((current) => ({ ...current, [key]: value }));
  };

  const toggleMode = (mode: ListingMode) => {
    const modes = values.modes.includes(mode) ? values.modes.filter((value) => value !== mode) : [...values.modes, mode];
    setValues((current) => ({
      ...current,
      modes,
      primaryMode: modes.includes(current.primaryMode) ? current.primaryMode : (modes[0] ?? current.primaryMode),
    }));
    onError("");
  };

  const run = (callback: (form: ListingFormValues, selectedImages: ListingImageDraft[]) => void) => {
    const validationError = validateListingForm(values);
    if (validationError) {
      onError(validationError);
      return;
    }
    callback(values, images);
  };

  const saveDraft = () => {
    if (values.title.trim().length < 2) {
      onError("保存草稿前请填写至少 2 个字的物品名称");
      return;
    }
    onSecondary?.(values, images);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <FieldLabel label="物品名称" required />
      <AppTextInput placeholder="例如：美的 1.5 匹变频空调" value={values.title} onChangeText={(value) => set("title", value)} maxLength={100} />

      <FieldLabel label="物品图片" />
      <ListingImagePicker images={images} onChange={setImages} disabled={submitting} onError={onError} />

      <FieldLabel label="分类" required />
      <ChipSelector options={ITEM_CATEGORIES.map((value) => ({ value, label: value }))} value={values.category} onChange={(value) => set("category", value)} />

      <FieldLabel label="品牌（选填）" />
      <AppTextInput placeholder="例如：美的 / 苹果 / 宜家" value={values.brand} onChangeText={(value) => set("brand", value)} maxLength={64} />

      <FieldLabel label="成色" required />
      <ChipSelector options={CONDITION_LEVELS.map((value) => ({ value, label: value }))} value={values.conditionLevel} onChange={(value) => set("conditionLevel", value)} />

      <FieldLabel label="功能状态" required />
      <ChipSelector options={FUNCTION_STATUSES.map((value) => ({ value, label: value }))} value={values.functionStatus} onChange={(value) => set("functionStatus", value)} />

      <FieldLabel label="物品描述" required />
      <AppTextInput placeholder="说明使用年限、瑕疵、配件和交付方式" value={values.description} onChangeText={(value) => set("description", value)} multiline maxLength={2000} />

      <FieldLabel label="所在城市或地区" required />
      <AppTextInput placeholder="例如：北京市朝阳区" value={values.cityName} onChangeText={(value) => set("cityName", value)} maxLength={64} />

      <FieldLabel label="交易方式（可多选）" required />
      <ChipSelector
        multi
        options={LISTING_MODES.map((mode) => ({ value: mode.value as ListingMode, label: mode.label }))}
        values={values.modes}
        onToggle={toggleMode}
      />

      {values.modes.length > 1 ? (
        <>
          <FieldLabel label="主要方式" required />
          <ChipSelector
            options={LISTING_MODES.filter((mode) => values.modes.includes(mode.value as ListingMode)).map((mode) => ({ value: mode.value as ListingMode, label: mode.label }))}
            value={values.primaryMode}
            onChange={(value) => set("primaryMode", value)}
          />
        </>
      ) : null}

      {values.modes.includes("fixed_price") ? (
        <>
          <FieldLabel label="一口价（元）" required />
          <AppTextInput placeholder="例如：800（仅支持整元）" value={values.price} onChangeText={(value) => set("price", value.replace(/\D/g, ""))} keyboardType="numeric" />
        </>
      ) : null}

      {values.modes.includes("accept_offers") ? (
        <>
          <FieldLabel label="最低可接受价（元，选填且不公开）" />
          <AppTextInput placeholder="请输入大于 0 的整元金额" value={values.minAcceptPrice} onChangeText={(value) => set("minAcceptPrice", value.replace(/\D/g, ""))} keyboardType="numeric" />
        </>
      ) : null}

      {values.modes.includes("swap") ? (
        <>
          <FieldLabel label="希望交换" required />
          <AppTextInput placeholder="例如：同等成色的平板电脑，可补差价面议" value={values.swapIntent} onChangeText={(value) => set("swapIntent", value)} maxLength={255} />
        </>
      ) : null}

      {values.modes.includes("giveaway") ? (
        <>
          <FieldLabel label="赠送规则" />
          <ChipSelector options={[...GIVEAWAY_RULES]} value={values.giveawayRule} onChange={(value) => set("giveawayRule", value)} />
        </>
      ) : null}

      {uploadProgress ? <Text className="text-sm text-primary mt-4">{uploadProgress}</Text> : null}
      {error ? <Text className="text-sm text-error mt-3 leading-5">{error}</Text> : null}

      <View className="mt-6 gap-3">
        <PrimaryButton title={submitTitle} onPress={() => run(onSubmit)} loading={submitting} />
        {secondaryTitle && onSecondary ? (
          <PrimaryButton title={secondaryTitle} variant="outline" onPress={saveDraft} disabled={submitting} />
        ) : null}
      </View>
      <Text className="text-xs text-muted mt-3 text-center leading-5">发布即表示信息真实有效；提交失败时已填写内容会保留，可直接重试。</Text>
    </ScrollView>
  );
}
