import React, { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { EMPTY_LISTING_FORM, ListingForm } from "@/components/listing-form";
import { ScreenContainer } from "@/components/screen-container";
import { type ListingFormValues, listingFormPayload, type ListingMode } from "@/lib/listing-form";
import { type ListingImageDraft, uploadListingImage } from "@/lib/listing-images";
import { trpc } from "@/lib/trpc";
import { shouldBlockAndroidBack, useAndroidBackGuard } from "@/hooks/use-unsaved-changes";

function CreateListingInner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const requestedMode = ["fixed_price", "accept_offers", "swap", "giveaway", "recycle"].includes(params.mode ?? "")
    ? (params.mode as ListingMode)
    : "fixed_price";
  const initialValues = { ...EMPTY_LISTING_FORM, modes: [requestedMode], primaryMode: requestedMode };
  const utils = trpc.useUtils();
  const createDraft = trpc.listings.createDraft.useMutation();
  const save = trpc.listings.save.useMutation();
  const [draftId, setDraftId] = useState<number>();
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const leave = useCallback(() => {
    const goBack = () => (router.canGoBack() ? router.back() : router.replace("/my-listings" as never));
    if (!dirty || submitting) return goBack();
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("尚未保存的内容会丢失，确认退出吗？")) goBack();
      return;
    }
    Alert.alert("退出发布？", "尚未保存的内容会丢失，也可以先保存草稿。", [
      { text: "继续填写", style: "cancel" },
      { text: "确认退出", style: "destructive", onPress: goBack },
    ]);
  }, [dirty, router, submitting]);
  useAndroidBackGuard(shouldBlockAndroidBack(dirty, submitting), leave);

  const persist = async (values: ListingFormValues, images: ListingImageDraft[], publish: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const id = draftId ?? (await createDraft.mutateAsync(listingFormPayload(values))).id;
      setDraftId(id);
      const fileIds: number[] = [];
      for (const [index, image] of images.entries()) {
        setUploadProgress(`正在上传图片 ${index + 1}/${images.length}`);
        fileIds.push(await uploadListingImage(id, image));
      }
      setUploadProgress(publish ? "正在发布物品…" : "正在保存草稿…");
      await save.mutateAsync({ id, ...listingFormPayload(values), imageFileIds: fileIds, publish });
      setDirty(false);
      await Promise.all([utils.listings.list.invalidate(), utils.home.feed.invalidate()]);
      router.replace((publish ? `/listings/${id}` : "/my-listings") as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请检查网络后重试");
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader title="发布物品" onBack={leave} />
      <ListingForm
        initialValues={initialValues}
        submitting={submitting}
        uploadProgress={uploadProgress}
        error={error}
        onError={setError}
        onDirtyChange={setDirty}
        onSubmit={(values, images) => persist(values, images, true)}
        onSecondary={(values, images) => persist(values, images, false)}
        secondaryTitle="保存草稿"
      />
    </KeyboardAvoidingView>
  );
}

export default function CreateListingScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <AuthGate title="登录后发布物品">
        <CreateListingInner />
      </AuthGate>
    </ScreenContainer>
  );
}
