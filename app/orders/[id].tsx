import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { trpc } from "@/lib/trpc";
import {
  AppTextInput,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  InfoRow,
  LoadingView,
  PrimaryButton,
  StarRating,
  StatusBadge,
} from "@/components/common";
import { ORDER_STATUS, REVIEW_DIMENSIONS_SERVICE, REVIEW_DIMENSIONS_TRADE, formatTime } from "@/lib/labels";
import { ListingImagePicker } from "@/components/listing-images";
import { type ListingImageDraft, uploadReviewImage } from "@/lib/listing-images";

const TYPE_LABEL: Record<string, string> = { listing: "旧物交易", project: "工程项目", recycling: "物品回收", swap: "物品置换" };

function OrderDetailInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const router = useRouter();
  const utils = trpc.useUtils();
  const detail = trpc.orders.detail.useQuery({ id: orderId }, { enabled: !Number.isNaN(orderId) });
  const commerceDetail = trpc.commerce.orderDetail.useQuery({ orderId }, { enabled: !Number.isNaN(orderId) });
  const finance = trpc.payments.byOrder.useQuery({ orderId }, { enabled: !Number.isNaN(orderId) });

  const [error, setError] = useState("");
  const [deliverVisible, setDeliverVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [overallRating, setOverallRating] = useState(5);
  const [dimensionRatings, setDimensionRatings] = useState<Record<string, number>>({});
  const [reviewContent, setReviewContent] = useState("");
  const [reviewTags, setReviewTags] = useState("");
  const [reviewImages, setReviewImages] = useState<ListingImageDraft[]>([]);
  const [reviewRequestId] = useState(() => `review-${orderId}-${Date.now()}`);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundKey] = useState(() => `refund-${orderId}-${Date.now()}`);

  const invalidate = () => {
    utils.orders.detail.invalidate({ id: orderId });
    utils.orders.list.invalidate();
  };
  const mkOpts = (close: () => void) => ({
    onSuccess: () => {
      close();
      invalidate();
    },
    onError: (e: { message: string }) => {
      close();
      setError(e.message);
    },
  });

  const deliverMut = trpc.orders.confirmDelivery.useMutation(mkOpts(() => setDeliverVisible(false)));
  const receiptMut = trpc.orders.confirmReceipt.useMutation(mkOpts(() => setReceiptVisible(false)));
  const cancelMut = trpc.orders.cancel.useMutation(mkOpts(() => setCancelVisible(false)));
  const reviewMut = trpc.orders.review.useMutation({
    onSuccess: () => {
      setShowReview(false);
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const replyMut = trpc.orders.replyReview.useMutation({
    onSuccess: () => { setReplyDrafts({}); invalidate(); },
    onError: (e) => setError(e.message),
  });
  const refundMut = trpc.refunds.submit.useMutation({
    onSuccess: () => { setRefundReason(""); utils.refunds.mine.invalidate(); utils.payments.byOrder.invalidate({ orderId }); invalidate(); },
    onError: (e) => setError(e.message),
  });
  const startChat = trpc.messagesRouter.start.useMutation({
    onSuccess: (res) => router.push(`/chat/${res.conversationId}` as any),
  });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="订单不存在或无权查看" />;

  const { order, logs, reviews, profileMap, myRole } = detail.data;
  const st = ORDER_STATUS[order.status] ?? { label: order.status, tone: "gray" as const };
  const otherId = myRole === "buyer" ? order.sellerId : order.buyerId;
  const otherName = profileMap[otherId]?.nickname ?? (myRole === "buyer" ? "卖方" : "买方");
  const myReviewed = myRole === "buyer" ? order.buyerReviewed : order.sellerReviewed;
  const dimensions = order.orderType === "project" ? REVIEW_DIMENSIONS_SERVICE : REVIEW_DIMENSIONS_TRADE;
  const canCancel = order.orderType !== "swap" && ["pending_confirmation", "pending_payment"].includes(order.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <View className="flex-row items-center justify-between mb-2">
            <StatusBadge label={st.label} tone={st.tone} />
            <Text className="text-xs text-muted">{formatTime(order.createdAt)}</Text>
          </View>
          <Text className="text-lg font-bold text-foreground leading-6">{order.title}</Text>
          <Text className="text-2xl font-bold text-action mt-1">{order.orderType === "swap" ? "双方物品置换" : `¥${order.amount}`}</Text>
          <View className="mt-3 pt-3 border-t border-border">
            <InfoRow label="订单类型" value={TYPE_LABEL[order.orderType] ?? order.orderType} />
            <InfoRow label="订单编号" value={`SH${String(order.id).padStart(8, "0")}`} />
            <InfoRow label={myRole === "buyer" ? "卖方" : "买方"} value={otherName} />
            {order.paidAt ? <InfoRow label="支付时间" value={formatTime(order.paidAt)} /> : null}
            {order.completedAt ? <InfoRow label="完成时间" value={formatTime(order.completedAt)} /> : null}
          </View>
          <View className="mt-3">
            <PrimaryButton
              title={`联系${myRole === "buyer" ? "卖方" : "买方"}`}
              variant="outline"
              small
              onPress={() => startChat.mutate({ targetUserId: otherId, refType: "order", refId: order.id })}
              loading={startChat.isPending}
            />
          </View>
        </View>

        {commerceDetail.data?.items.length ? (
          <View className="mt-3 rounded-2xl border border-border bg-surface p-4">
            <Text className="text-base font-semibold text-foreground">商品明细</Text>
            {commerceDetail.data.items.map((item) => (
              <View key={item.id} className="mt-3 border-t border-border pt-3">
                <Text className="font-bold text-foreground">{item.title}</Text>
                <Text className="mt-1 text-xs text-muted">{item.skuCode} · {Object.entries(item.attributes).map(([key, value]) => `${key}:${value}`).join(" · ")}</Text>
                <Text className="mt-1 text-sm text-action">¥{item.unitPrice} × {item.quantity} = ¥{item.lineAmount}</Text>
                {item.productModelId ? <Text className="mt-1 text-xs text-primary">已保留产品目录关联</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        {commerceDetail.data?.shipping ? (
          <View className="mt-3 rounded-2xl border border-border bg-surface p-4">
            <Text className="text-base font-semibold text-foreground">配送信息</Text>
            <Text className="mt-2 text-sm text-foreground">{commerceDetail.data.shipping.recipientName} {commerceDetail.data.shipping.phoneMasked}</Text>
            <Text className="mt-1 text-sm leading-6 text-muted">{commerceDetail.data.shipping.province} {commerceDetail.data.shipping.city} {commerceDetail.data.shipping.district} {commerceDetail.data.shipping.addressLine}</Text>
          </View>
        ) : null}

        {order.orderType === "swap" ? (
          <View className="bg-primary/5 rounded-2xl p-4 mt-3 border border-primary/20">
            <Text className="text-sm text-foreground leading-5 mb-3">置换由双方在置换详情中分别确认，不需要支付，也不能从普通订单入口直接完成。</Text>
            <PrimaryButton title="查看置换进度" onPress={() => router.push(`/swaps/${order.refId}` as never)} />
          </View>
        ) : null}

        {/* 状态操作 */}
        {order.orderType !== "swap" && order.status === "pending_payment" && myRole === "buyer" ? (
          <View className="bg-warning/10 rounded-2xl p-4 mt-3 border border-warning/30">
            <Text className="text-sm text-foreground leading-5 mb-3">订单待支付。请创建支付单并通过沙箱支付提供商确认，成功后款项进入可追溯托管记录。</Text>
            <PrimaryButton title={`进入沙箱支付 ¥${order.amount}`} variant="action" onPress={() => router.push(`/payments/${order.id}` as never)} />
          </View>
        ) : null}
        {order.orderType !== "swap" && order.status === "pending_payment" && myRole === "seller" ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-sm text-muted leading-5">等待买方支付。</Text>
          </View>
        ) : null}
        {order.orderType !== "swap" && ["pending_delivery", "pending_confirmation"].includes(order.status) && myRole === "seller" ? (
          <View className="bg-warning/10 rounded-2xl p-4 mt-3 border border-warning/30">
            <Text className="text-sm text-foreground leading-5 mb-3">
              {order.orderType === "recycling" ? "请与用户预约上门检测取件,完成后点击确认交付。" : "请安排交付(自提/送货/快递),交付后点击确认。"}
            </Text>
            <PrimaryButton title="确认已交付" onPress={() => setDeliverVisible(true)} />
          </View>
        ) : null}
        {order.orderType !== "swap" && ["pending_delivery", "pending_confirmation"].includes(order.status) && myRole === "buyer" ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-sm text-muted leading-5">等待对方交付。</Text>
          </View>
        ) : null}
        {order.orderType !== "swap" && order.status === "pending_acceptance" && myRole === "buyer" ? (
          <View className="bg-warning/10 rounded-2xl p-4 mt-3 border border-warning/30">
            <Text className="text-sm text-foreground leading-5 mb-3">对方已交付,请验收物品/服务后确认收货。确认后款项将结算给对方。</Text>
            <PrimaryButton title="确认收货" onPress={() => setReceiptVisible(true)} />
          </View>
        ) : null}
        {order.orderType !== "swap" && order.status === "pending_acceptance" && myRole === "seller" ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-sm text-muted leading-5">已交付,等待买方确认收货。</Text>
          </View>
        ) : null}

        {myRole === "buyer" && finance.data?.payment && ["success", "partially_refunded"].includes(finance.data.payment.status) ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-base font-semibold text-foreground">申请退款</Text>
            <Text className="text-xs text-muted mt-1">提交后由财务管理员复核，不能直接把退款状态改为成功。</Text>
            <FieldLabel label="退款金额" required />
            <AppTextInput value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" placeholder={`最多 ¥${finance.data.payment.amount}`} />
            <FieldLabel label="退款原因" required />
            <AppTextInput value={refundReason} onChangeText={setRefundReason} multiline placeholder="请说明退款原因和相关事实" />
            <View className="mt-3"><PrimaryButton variant="outline" title="提交退款申请" loading={refundMut.isPending} disabled={!refundAmount || refundReason.trim().length < 5} onPress={() => refundMut.mutate({ paymentId: finance.data!.payment!.id, amount: refundAmount, reason: refundReason.trim(), idempotencyKey: refundKey })} /></View>
          </View>
        ) : null}

        {/* 完成后评价 */}
        {order.status === "completed" && !myReviewed ? (
          <View className="bg-primary/5 rounded-2xl p-4 mt-3 border border-primary/20">
            <Text className="text-sm text-foreground leading-5 mb-3">订单已完成,给对方一个评价吧,评价会影响对方的信用记录。</Text>
            <PrimaryButton title="去评价" onPress={() => setShowReview(!showReview)} />
          </View>
        ) : null}
        {order.status === "completed" && myReviewed ? (
          <View className="bg-surface rounded-2xl p-4 mt-3 border border-border">
            <Text className="text-sm text-muted">你已完成评价,感谢参与。</Text>
          </View>
        ) : null}

        {/* 评价表单 */}
        {showReview ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground mb-2">评价对方</Text>
            <FieldLabel label="总体评分" required />
            <StarRating value={overallRating} onChange={setOverallRating} />
            {dimensions.map((d) => (
              <View key={d.key}>
                <FieldLabel label={d.label} />
                <StarRating
                  value={dimensionRatings[d.key] ?? 5}
                  onChange={(v) => setDimensionRatings((prev) => ({ ...prev, [d.key]: v }))}
                  size={22}
                />
              </View>
            ))}
            <FieldLabel label="评价内容(选填)" />
            <AppTextInput placeholder="说说这次合作/交易的体验" value={reviewContent} onChangeText={setReviewContent} multiline maxLength={500} />
            <FieldLabel label="评价标签(选填)" />
            <AppTextInput placeholder="如：描述准确、发货及时（用逗号分隔）" value={reviewTags} onChangeText={setReviewTags} maxLength={160} />
            <FieldLabel label="评价图片(选填)" />
            <ListingImagePicker images={reviewImages} onChange={setReviewImages} disabled={reviewMut.isPending} onError={setError} />
            <View className="mt-4">
              <PrimaryButton
                title="提交评价"
                onPress={async () => {
                  try {
                    setError("");
                    const imageFileIds = await Promise.all(reviewImages.map(uploadReviewImage));
                    reviewMut.mutate({
                    id: orderId,
                    overallRating,
                    dimensions: Object.keys(dimensionRatings).length > 0 ? dimensionRatings : undefined,
                    tags: reviewTags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
                    imageFileIds,
                    content: reviewContent.trim() || undefined,
                    requestId: reviewRequestId,
                    });
                  } catch (uploadError) {
                    setError(uploadError instanceof Error ? uploadError.message : "评价图片上传失败");
                  }
                }}
                loading={reviewMut.isPending}
              />
            </View>
          </View>
        ) : null}

        {reviews.length ? (
          <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
            <Text className="text-base font-semibold text-foreground mb-2">交易评价</Text>
            {reviews.map((review) => (
              <View key={review.id} className="py-3 border-b border-border">
                <Text className="text-sm font-medium text-warning">{"★".repeat(review.overallRating)}{"☆".repeat(5 - review.overallRating)}</Text>
                {review.tags?.length ? <Text className="text-xs text-primary mt-1">{review.tags.join(" · ")}</Text> : null}
                {review.content ? <Text className="text-sm text-foreground mt-1 leading-5">{review.content}</Text> : null}
                <Text className="text-xs text-muted mt-1">来源：{review.businessSource} · 影响：{review.impactDimension}</Text>
                {review.reply ? <View className="bg-background rounded-xl p-3 mt-2"><Text className="text-xs text-muted">被评价方回复</Text><Text className="text-sm text-foreground mt-1">{review.reply}</Text></View> : null}
                {!review.reply && review.reviewerId === otherId ? (
                  <View className="mt-2">
                    <AppTextInput placeholder="回复这条评价" value={replyDrafts[review.id] ?? ""} onChangeText={(value) => setReplyDrafts((current) => ({ ...current, [review.id]: value }))} maxLength={500} />
                    <PrimaryButton small variant="outline" title="提交回复" disabled={(replyDrafts[review.id]?.trim().length ?? 0) < 2} loading={replyMut.isPending} onPress={() => replyMut.mutate({ reviewId: review.id, reply: replyDrafts[review.id]!.trim() })} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 订单日志 */}
        <View className="bg-surface rounded-2xl border border-border p-4 mt-3">
          <Text className="text-base font-semibold text-foreground mb-2">订单动态</Text>
          {logs.length === 0 ? (
            <Text className="text-sm text-muted">暂无动态</Text>
          ) : (
            logs.map((l) => (
              <View key={l.id} className="flex-row py-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 mr-2.5" />
                <View className="flex-1">
                  <Text className="text-sm text-foreground leading-5">{l.note}</Text>
                  <Text className="text-xs text-muted mt-0.5">{formatTime(l.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {canCancel ? (
          <View className="mt-4">
            <PrimaryButton title="取消订单" variant="muted" onPress={() => setCancelVisible(true)} />
          </View>
        ) : null}

        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
      </ScrollView>

      <ConfirmDialog
        visible={deliverVisible}
        title="确认交付"
        message="确认你已完成交付(物品已交给对方或服务已完成)?"
        confirmText="确认交付"
        loading={deliverMut.isPending}
        onCancel={() => setDeliverVisible(false)}
        onConfirm={() => deliverMut.mutate({ id: orderId })}
      />
      <ConfirmDialog
        visible={receiptVisible}
        title="确认收货"
        message="确认收货后款项将结算给对方,此操作不可撤销。请确认已验收无误。"
        confirmText="确认收货"
        loading={receiptMut.isPending}
        onCancel={() => setReceiptVisible(false)}
        onConfirm={() => receiptMut.mutate({ id: orderId })}
      />
      <ConfirmDialog
        visible={cancelVisible}
        title="取消订单"
        message="确认取消该订单吗?取消后如需交易需要重新下单。"
        confirmText="确认取消"
        danger
        loading={cancelMut.isPending}
        onCancel={() => setCancelVisible(false)}
        onConfirm={() => cancelMut.mutate({ id: orderId })}
      />
    </KeyboardAvoidingView>
  );
}

export default function OrderDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="订单详情" />
      <AuthGate title="登录后查看订单">
        <OrderDetailInner />
      </AuthGate>
    </ScreenContainer>
  );
}
