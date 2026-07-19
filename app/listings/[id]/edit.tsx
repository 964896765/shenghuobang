import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ErrorState, LoadingView } from "@/components/common";
import { ListingForm } from "@/components/listing-form";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { type ListingFormValues, listingFormPayload, type ListingMode } from "@/lib/listing-form";
import { existingListingImages, type ListingImageDraft, uploadListingImage } from "@/lib/listing-images";
import { trpc } from "@/lib/trpc";
import { shouldBlockAndroidBack, useAndroidBackGuard } from "@/hooks/use-unsaved-changes";

function EditListingInner() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const router = useRouter();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const detail = trpc.listings.detail.useQuery({ id }, { enabled: Number.isFinite(id) });
  const save = trpc.listings.save.useMutation();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const leave = useCallback(() => {
    const goBack = () => (router.canGoBack() ? router.back() : router.replace("/my-listings" as never));
    if (!dirty || submitting) return goBack();
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("尚未保存的修改会丢失，确认退出吗？")) goBack();
      return;
    }
    Alert.alert("退出编辑？", "尚未保存的修改会丢失。", [
      { text: "继续编辑", style: "cancel" },
      { text: "确认退出", style: "destructive", onPress: goBack },
    ]);
  }, [dirty, router, submitting]);
  useAndroidBackGuard(shouldBlockAndroidBack(dirty, submitting), leave);

  const initial = useMemo(() => {
    const listing = detail.data?.listing;
    if (!listing) return null;
    const modes = (listing.modes ?? [listing.primaryMode]) as ListingMode[];
    const values: ListingFormValues = {
      title: listing.title,
      category: listing.category ?? "其他",
      brand: listing.brand ?? "",
      conditionLevel: listing.conditionLevel ?? "九成新",
      functionStatus: listing.functionStatus ?? "功能正常",
      description: listing.description ?? "",
      cityName: listing.cityName ?? "北京",
      modes,
      primaryMode: listing.primaryMode as ListingMode,
      price: listing.price ? String(listing.price) : "",
      minAcceptPrice: listing.minAcceptPrice ? String(listing.minAcceptPrice) : "",
      swapIntent: listing.swapIntent ?? "",
      giveawayRule: (listing.giveawayRule as ListingFormValues["giveawayRule"]) ?? "apply",
    };
    return { values, images: existingListingImages(listing.imageUrls) };
  }, [detail.data]);

  if (detail.isLoading) return <LoadingView />;
  if (detail.isError) return <ErrorState title="无法加载物品" hint={detail.error.message} onRetry={() => detail.refetch()} />;
  const listing = detail.data?.listing;
  if (!initial || !listing || listing.sellerId !== user?.id) return <ErrorState title="无法编辑该物品" hint="物品不存在、已删除或你不是发布者。" />;
  if (["reserved", "completed"].includes(listing.status)) return <ErrorState title="当前物品不能编辑" hint="物品已进入交易或已成交，请在订单中查看最新状态。" />;

  const persist = async (values: ListingFormValues, images: ListingImageDraft[], publish: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const fileIds: number[] = [];
      for (const [index, image] of images.entries()) {
        setUploadProgress(`正在处理图片 ${index + 1}/${images.length}`);
        fileIds.push(await uploadListingImage(id, image));
      }
      setUploadProgress(publish ? "正在保存并更新上架状态…" : "正在保存修改…");
      await save.mutateAsync({ id, ...listingFormPayload(values), imageFileIds: fileIds, publish });
      setDirty(false);
      await Promise.all([
        utils.listings.detail.invalidate({ id }),
        utils.listings.list.invalidate(),
        utils.home.feed.invalidate(),
      ]);
      router.replace(`/listings/${id}` as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  const status = listing.status;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader title="编辑物品" onBack={leave} />
      <ListingForm
        key={`${id}-${listing.updatedAt}`}
        initialValues={initial.values}
        initialImages={initial.images}
        submitting={submitting}
        uploadProgress={uploadProgress}
        error={error}
        onError={setError}
        onDirtyChange={setDirty}
        submitTitle={status === "published" ? "保存修改" : "保存并上架"}
        secondaryTitle={status === "closed" || status === "draft" ? "仅保存修改" : undefined}
        onSubmit={(values, images) => persist(values, images, true)}
        onSecondary={(values, images) => persist(values, images, false)}
      />
    </KeyboardAvoidingView>
  );
}

export default function EditListingScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <AuthGate title="登录后编辑物品">
        <EditListingInner />
      </AuthGate>
    </ScreenContainer>
  );
}
