import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import {
  AppTextInput,
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FieldLabel,
  InfoRow,
  LoadingView,
  PrimaryButton,
  StatusBadge,
} from "@/components/common";
import { ListingImage } from "@/components/listing-images";
import { listingImageUrl } from "@/lib/listing-images";
import { LISTING_STATUS, OFFER_STATUS, GIVEAWAY_APP_STATUS, LISTING_MODES, formatTime } from "@/lib/labels";
import { startLogin } from "@/constants/app";

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const detail = trpc.listings.detail.useQuery({ id: listingId }, { enabled: !Number.isNaN(listingId) });

  const [error, setError] = useState("");
  const [buyVisible, setBuyVisible] = useState(false);
  const [closeVisible, setCloseVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyReason, setApplyReason] = useState("");
  const [acceptOfferTarget, setAcceptOfferTarget] = useState<number | null>(null);
  const [selectAppTarget, setSelectAppTarget] = useState<number | null>(null);

  const invalidate = () => {
    utils.listings.detail.invalidate({ id: listingId });
    utils.listings.list.invalidate();
  };

  const buyMut = trpc.listings.buyNow.useMutation({
    onSuccess: (res) => {
      setBuyVisible(false);
      invalidate();
      utils.orders.list.invalidate();
      router.push(`/orders/${res.orderId}` as any);
    },
    onError: (e) => {
      setBuyVisible(false);
      setError(e.message);
    },
  });
  const offerMut = trpc.listings.makeOffer.useMutation({
    onSuccess: () => {
      setShowOfferForm(false);
      setOfferAmount("");
      setOfferMessage("");
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const applyMut = trpc.listings.applyGiveaway.useMutation({
    onSuccess: () => {
      setShowApplyForm(false);
      setApplyReason("");
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const acceptOfferMut = trpc.listings.acceptOffer.useMutation({
    onSuccess: (res) => {
      setAcceptOfferTarget(null);
      invalidate();
      router.push(`/orders/${res.orderId}` as any);
    },
    onError: (e) => {
      setAcceptOfferTarget(null);
      setError(e.message);
    },
  });
  const selectAppMut = trpc.listings.selectGiveaway.useMutation({
    onSuccess: (res) => {
      setSelectAppTarget(null);
      invalidate();
      router.push(`/orders/${res.orderId}` as any);
    },
    onError: (e) => {
      setSelectAppTarget(null);
      setError(e.message);
    },
  });
  const closeMut = trpc.listings.close.useMutation({
    onSuccess: () => {
      setCloseVisible(false);
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const reopenMut = trpc.listings.reopen.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => setError(e.message),
  });
  const removeMut = trpc.listings.remove.useMutation({
    onSuccess: async () => {
      setDeleteVisible(false);
      await Promise.all([utils.listings.list.invalidate(), utils.home.feed.invalidate()]);
      router.replace("/my-listings" as never);
    },
    onError: (e) => {
      setDeleteVisible(false);
      setError(e.message);
    },
  });
  const startChat = trpc.messagesRouter.start.useMutation({
    onSuccess: (res) => router.push(`/chat/${res.conversationId}` as any),
  });

  if (detail.isLoading) {
    return (
      <ScreenContainer>
        <PageHeader title="物品详情" />
        <LoadingView />
      </ScreenContainer>
    );
  }
  if (detail.isError) {
    return (
      <ScreenContainer>
        <PageHeader title="物品详情" />
        <ErrorState title="无法加载物品" hint={detail.error.message} onRetry={() => detail.refetch()} />
      </ScreenContainer>
    );
  }
  if (!detail.data) {
    return (
      <ScreenContainer>
        <PageHeader title="物品详情" />
        <EmptyState title="物品不存在或已删除" />
      </ScreenContainer>
    );
  }

  const { listing, offers, applications, profileMap } = detail.data;
  const st = LISTING_STATUS[listing.status] ?? { label: listing.status, tone: "gray" as const };
  const isSeller = user?.id === listing.sellerId;
  const modes = (listing.modes ?? []) as string[];
  const modeLabel = (m: string) => LISTING_MODES.find((x) => x.value === m)?.label ?? m;
  const canAct = listing.status === "published" && !isSeller;
  const imageUrls = (listing.imageUrls ?? []).map(listingImageUrl);
  const myApplication = applications.find((a) => a.applicantId === user?.id);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <PageHeader title="物品详情" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
            {(imageUrls.length ? imageUrls : [null]).map((uri) => (
              <ListingImage key={uri ?? "placeholder"} uri={uri} className="w-72 h-52 rounded-2xl" />
            ))}
          </ScrollView>
          <View className="bg-surface rounded-2xl border border-border p-4">
            <View className="flex-row items-center justify-between mb-2">
              <StatusBadge label={st.label} tone={st.tone} />
              <Text className="text-xs text-muted">{formatTime(listing.createdAt)}</Text>
            </View>
            <Text className="text-xl font-bold text-foreground leading-7">{listing.title}</Text>
            <View className="flex-row items-center gap-2 mt-2 flex-wrap">
              {modes.map((m) => (
                <View key={m} className="bg-accent/10 rounded-full px-2.5 py-0.5">
                  <Text className="text-xs text-accent">{modeLabel(m)}</Text>
                </View>
              ))}
            </View>
            {listing.price ? <Text className="text-2xl font-bold text-action mt-2">¥{listing.price}</Text> : null}
            {modes.includes("giveaway") && !listing.price ? (
              <Text className="text-2xl font-bold text-primary mt-2">免费赠送</Text>
            ) : null}
            <View className="mt-3 pt-3 border-t border-border">
              <InfoRow label="分类" value={listing.category} />
              <InfoRow label="品牌" value={listing.brand} />
              <InfoRow label="成色" value={listing.conditionLevel} />
              <InfoRow label="功能状态" value={listing.functionStatus} />
              <InfoRow label="所在城市" value={listing.cityName} />
              <InfoRow label="发布者" value={profileMap[listing.sellerId]?.nickname ?? "用户"} />
              {modes.includes("swap") ? <InfoRow label="希望交换" value={listing.swapIntent ?? "可与发布者沟通"} /> : null}
            </View>
            {listing.description ? (
              <View className="mt-3 pt-3 border-t border-border">
                <Text className="text-sm font-semibold text-foreground mb-1">物品描述</Text>
                <Text className="text-sm text-foreground leading-6">{listing.description}</Text>
              </View>
            ) : null}
          </View>

          {/* 买家操作 */}
          {canAct ? (
            <View className="mt-4">
              <View className="flex-row gap-3">
                {modes.includes("fixed_price") && listing.price ? (
                  <View className="flex-1">
                    <PrimaryButton
                      title={`¥${listing.price} 立即拍下`}
                      variant="action"
                      onPress={() => (isAuthenticated ? setBuyVisible(true) : startLogin())}
                    />
                  </View>
                ) : null}
                {modes.includes("accept_offers") ? (
                  <View className="flex-1">
                    <PrimaryButton
                      title="我要出价"
                      onPress={() => (isAuthenticated ? setShowOfferForm(!showOfferForm) : startLogin())}
                    />
                  </View>
                ) : null}
              </View>
              <View className="flex-row gap-3 mt-3">
                {modes.includes("swap") ? (
                  <View className="flex-1">
                    <PrimaryButton
                      title="发起置换"
                      onPress={() =>
                        isAuthenticated
                          ? router.push(`/swaps/create?targetListingId=${listing.id}` as any)
                          : startLogin()
                      }
                    />
                  </View>
                ) : null}
                {modes.includes("giveaway") && !myApplication ? (
                  <View className="flex-1">
                    <PrimaryButton
                      title="申请领取"
                      onPress={() => (isAuthenticated ? setShowApplyForm(!showApplyForm) : startLogin())}
                    />
                  </View>
                ) : null}
                <View className="flex-1">
                  <PrimaryButton
                    title="联系卖家"
                    variant="outline"
                    onPress={() =>
                      isAuthenticated
                        ? startChat.mutate({ targetUserId: listing.sellerId, refType: "listing", refId: listing.id })
                        : startLogin()
                    }
                    loading={startChat.isPending}
                  />
                </View>
              </View>
              {myApplication ? (
                <View className="bg-primary/5 rounded-xl p-3 mt-3 border border-primary/20">
                  <Text className="text-sm text-foreground">
                    已提交领取申请({GIVEAWAY_APP_STATUS[myApplication.status]?.label ?? myApplication.status}),等待赠送者选择。
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 出价表单 */}
          {showOfferForm ? (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-base font-semibold text-foreground">提交出价</Text>
              <FieldLabel label="出价金额(元)" required />
              <AppTextInput placeholder="如:500" value={offerAmount} onChangeText={setOfferAmount} keyboardType="numeric" />
              <FieldLabel label="留言(选填)" />
              <AppTextInput placeholder="如:可以自提,今天就能来拿" value={offerMessage} onChangeText={setOfferMessage} />
              <View className="flex-row gap-3 mt-4">
                <View className="flex-1">
                  <PrimaryButton title="取消" variant="muted" onPress={() => setShowOfferForm(false)} />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    title="提交出价"
                    onPress={() => {
                      const amount = parseInt(offerAmount, 10);
                      if (Number.isNaN(amount) || amount < 1) {
                        setError("请填写有效出价");
                        return;
                      }
                      setError("");
                      offerMut.mutate({ id: listingId, amount, message: offerMessage.trim() || undefined });
                    }}
                    loading={offerMut.isPending}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {/* 申请领取表单 */}
          {showApplyForm ? (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-base font-semibold text-foreground">申请领取</Text>
              <FieldLabel label="申请理由(选填)" />
              <AppTextInput placeholder="说说为什么需要它,提高被选中的机会" value={applyReason} onChangeText={setApplyReason} multiline />
              <View className="flex-row gap-3 mt-4">
                <View className="flex-1">
                  <PrimaryButton title="取消" variant="muted" onPress={() => setShowApplyForm(false)} />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    title="提交申请"
                    onPress={() => applyMut.mutate({ id: listingId, reason: applyReason.trim() || undefined })}
                    loading={applyMut.isPending}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {/* 卖家:出价列表 */}
          {isSeller && offers.length > 0 ? (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-base font-semibold text-foreground mb-2">收到的出价 {offers.length}</Text>
              {offers.map((o) => {
                const ost = OFFER_STATUS[o.status] ?? { label: o.status, tone: "gray" as const };
                return (
                  <View key={o.id} className="py-2.5 border-b border-border">
                    <View className="flex-row items-center">
                      <Avatar name={profileMap[o.buyerId]?.nickname} size={30} />
                      <View className="flex-1 ml-2.5">
                        <Text className="text-sm font-medium text-foreground">{profileMap[o.buyerId]?.nickname ?? "买家"}</Text>
                        {o.message ? <Text className="text-xs text-muted mt-0.5">{o.message}</Text> : null}
                      </View>
                      <Text className="text-base font-bold text-action mr-2">¥{o.amount}</Text>
                      <StatusBadge label={ost.label} tone={ost.tone} small />
                    </View>
                    {listing.status === "published" && ["submitted", "negotiating"].includes(o.status) ? (
                      <View className="mt-2">
                        <PrimaryButton title="接受此出价" small onPress={() => setAcceptOfferTarget(o.id)} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {listing.minAcceptPrice ? (
                <Text className="text-xs text-muted mt-2">你设置的最低可接受价:¥{listing.minAcceptPrice}(仅自己可见)</Text>
              ) : null}
            </View>
          ) : null}

          {/* 卖家:领取申请列表 */}
          {isSeller && applications.length > 0 ? (
            <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
              <Text className="text-base font-semibold text-foreground mb-2">领取申请 {applications.length}</Text>
              {applications.map((a) => {
                const ast = GIVEAWAY_APP_STATUS[a.status] ?? { label: a.status, tone: "gray" as const };
                return (
                  <View key={a.id} className="py-2.5 border-b border-border">
                    <View className="flex-row items-center">
                      <Avatar name={profileMap[a.applicantId]?.nickname} size={30} />
                      <View className="flex-1 ml-2.5">
                        <Text className="text-sm font-medium text-foreground">{profileMap[a.applicantId]?.nickname ?? "用户"}</Text>
                        {a.reason ? <Text className="text-xs text-muted mt-0.5">{a.reason}</Text> : null}
                      </View>
                      <StatusBadge label={ast.label} tone={ast.tone} small />
                    </View>
                    {listing.status === "published" && a.status === "submitted" ? (
                      <View className="mt-2">
                        <PrimaryButton title="选择TA" small onPress={() => setSelectAppTarget(a.id)} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* 卖家管理 */}
          {isSeller && listing.status === "published" ? (
            <View className="mt-4 gap-3">
              <PrimaryButton title="编辑物品" variant="outline" onPress={() => router.push(`/listings/${listing.id}/edit` as any)} />
              <PrimaryButton title="下架物品" variant="muted" onPress={() => setCloseVisible(true)} />
            </View>
          ) : null}

          {isSeller && ["draft", "closed"].includes(listing.status) ? (
            <View className="mt-4 gap-3">
              <PrimaryButton title="编辑物品" variant="outline" onPress={() => router.push(`/listings/${listing.id}/edit` as any)} />
              {listing.status === "closed" ? (
                <PrimaryButton title="重新上架" onPress={() => reopenMut.mutate({ id: listing.id })} loading={reopenMut.isPending} />
              ) : null}
              <PrimaryButton title="删除物品" variant="danger" onPress={() => setDeleteVisible(true)} />
            </View>
          ) : null}

          {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
        </ScrollView>

        <ConfirmDialog
          visible={buyVisible}
          title="确认拍下"
          message={`将以 ¥${listing.price} 拍下「${listing.title}」,拍下后请尽快完成支付(演示环境模拟支付)。`}
          confirmText="确认拍下"
          loading={buyMut.isPending}
          onCancel={() => setBuyVisible(false)}
          onConfirm={() => buyMut.mutate({ id: listingId })}
        />
        <ConfirmDialog
          visible={acceptOfferTarget !== null}
          title="接受出价"
          message="接受后将与该买家成交,其他出价自动失效。确认接受吗?"
          confirmText="确认接受"
          loading={acceptOfferMut.isPending}
          onCancel={() => setAcceptOfferTarget(null)}
          onConfirm={() => acceptOfferTarget && acceptOfferMut.mutate({ listingId, offerId: acceptOfferTarget })}
        />
        <ConfirmDialog
          visible={selectAppTarget !== null}
          title="选择领取人"
          message="选择后将与该申请人建立赠送订单,其他申请自动失效。确认选择吗?"
          confirmText="确认选择"
          loading={selectAppMut.isPending}
          onCancel={() => setSelectAppTarget(null)}
          onConfirm={() => selectAppTarget && selectAppMut.mutate({ listingId, applicationId: selectAppTarget })}
        />
        <ConfirmDialog
          visible={closeVisible}
          title="下架物品"
          message="下架后其他用户将无法看到该物品。确认下架吗?"
          confirmText="确认下架"
          danger
          loading={closeMut.isPending}
          onCancel={() => setCloseVisible(false)}
          onConfirm={() => closeMut.mutate({ id: listingId })}
        />
        <ConfirmDialog
          visible={deleteVisible}
          title="删除物品"
          message="删除后将不再出现在我的发布中。已进入交易或存在进行中置换请求的物品不能删除。"
          confirmText="确认删除"
          danger
          loading={removeMut.isPending}
          onCancel={() => setDeleteVisible(false)}
          onConfirm={() => removeMut.mutate({ id: listingId })}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
