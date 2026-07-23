import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pressable, ScrollView, Share, Text, View } from "react-native";

import { PageHeader } from "@/components/auth-gate";
import { AppTextInput, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { IdentityBadge, SourceLabel, TrustBadge } from "@/components/trust-ui";
import { startLogin } from "@/constants/app";
import { contentMediaUrl } from "@/lib/content-media";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import { contentTypeLabel, newContentRequestId, RELATION_LABELS, SOURCE_LABELS } from "@/shared/content";

function ContentVideo({ fileId }: { fileId: number }) {
  const player = useVideoPlayer(contentMediaUrl(fileId), (instance) => { instance.loop = false; });
  return <VideoView player={player} style={{ width: "100%", height: 240, borderRadius: 12 }} nativeControls contentFit="contain" />;
}

export default function ContentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; preview?: string }>();
  const postId = Number(params.id);
  const { isAuthenticated } = useRole();
  const utils = trpc.useUtils();
  const detail = trpc.content.detail.useQuery({ postId: Number.isSafeInteger(postId) && postId > 0 ? postId : 1 }, { enabled: Number.isSafeInteger(postId) && postId > 0 });
  const setLike = trpc.content.setLike.useMutation();
  const setFavorite = trpc.content.setFavorite.useMutation();
  const record = trpc.content.recordInteraction.useMutation();
  const recordMutation = record.mutate;
  const addComment = trpc.content.addComment.useMutation();
  const setFollow = trpc.content.setFollow.useMutation();
  const report = trpc.content.report.useMutation();
  const [comment, setComment] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDetail, setReportDetail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !Number.isSafeInteger(postId) || postId <= 0) return;
    recordMutation({ postId, interactionType: "view", requestId: newContentRequestId("view") });
  }, [isAuthenticated, postId, recordMutation]);

  const refresh = async () => {
    await Promise.all([detail.refetch(), utils.content.discover.invalidate(), utils.content.creatorDashboard.invalidate()]);
  };

  if (detail.isLoading) return <ScreenContainer><PageHeader title="内容详情" /><LoadingView text="正在加载内容…" /></ScreenContainer>;
  if (detail.isError) return <ScreenContainer><PageHeader title="内容详情" /><ErrorState title="内容不可访问" hint={detail.error.message} onRetry={() => detail.refetch()} /></ScreenContainer>;
  const item = detail.data;
  if (!item) return <ScreenContainer><PageHeader title="内容详情" /><EmptyState title="内容不存在" hint="该内容可能已删除、下架或你没有访问权限。" actionTitle="返回发现" onAction={() => router.replace("/(tabs)/discover" as never)} /></ScreenContainer>;

  const interact = async (type: "like" | "favorite") => {
    if (!isAuthenticated) return startLogin();
    const active = type === "like" ? !item.viewer.liked : !item.viewer.favorited;
    const mutation = type === "like" ? setLike : setFavorite;
    await mutation.mutateAsync({ postId, active, requestId: newContentRequestId(type) });
    await refresh();
  };

  const share = async () => {
    await Share.share({ title: item.title, message: `${item.title}\n${item.summary || item.body.slice(0, 100)}` });
    if (isAuthenticated) record.mutate({ postId, interactionType: "share", requestId: newContentRequestId("share") });
  };

  const navigateRelation = async (relation: typeof item.relations[number]) => {
    if (!relation.route) return setMessage("该关联对象暂无公开访问页面");
    if (isAuthenticated && ["product", "product_unit", "listing", "idea"].includes(relation.relationType)) {
      const interactionType = relation.relationType === "listing" ? "listing_click" : relation.relationType === "idea" ? "idea_click" : "product_click";
      await record.mutateAsync({ postId, interactionType, requestId: newContentRequestId(interactionType) });
    }
    router.push(relation.route as never);
  };

  const sendComment = async () => {
    if (!isAuthenticated) return startLogin();
    if (!comment.trim()) return;
    await addComment.mutateAsync({ postId, body: comment.trim(), requestId: newContentRequestId("comment") });
    setComment("");
    await refresh();
  };

  const follow = async () => {
    if (!isAuthenticated) return startLogin();
    await setFollow.mutateAsync({ followedAccountId: item.authorAccountId, active: true, requestId: newContentRequestId("follow") });
    setMessage("已关注作者");
  };

  const submitReport = async () => {
    if (!isAuthenticated) return startLogin();
    await report.mutateAsync({ postId, reasonCode: "USER_REPORTED", detail: reportDetail.trim() || undefined, requestId: newContentRequestId("report") });
    setReportOpen(false);
    setReportDetail("");
    setMessage("举报已提交，平台将按流程处理");
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title={params.preview ? "内容预览" : "内容详情"} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {params.preview ? <View className="mb-3"><StatusBadge label="作者预览 · 尚未公开" tone="orange" /></View> : null}
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-base font-semibold text-foreground">{item.author?.name || "生活帮用户"}</Text>
          {item.author?.verificationLabel ? <IdentityBadge label={item.author.verificationLabel} /> : <StatusBadge label="作者未展示认证" />}
          <Pressable onPress={() => void follow()}><Text className="text-sm font-semibold text-primary">关注</Text></Pressable>
        </View>
        <Text className="mt-4 text-2xl font-bold leading-9 text-foreground">{item.title}</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          <StatusBadge label={contentTypeLabel(item.contentType)} tone="blue" />
          {item.locationLabel ? <StatusBadge label={item.locationLabel} /> : null}
        </View>
        <View className="mt-3 rounded-xl border border-border bg-surface p-3">
          <SourceLabel>{SOURCE_LABELS[item.sourceType] ?? item.sourceType}</SourceLabel>
          <Text className="mt-1 text-xs leading-5 text-muted">声明：{item.sourceStatement}</Text>
          {item.aiAssisted ? <Text className="mt-1 text-xs text-orange-600">AI 仅参与整理，结果已由作者确认；不等于平台核验。</Text> : null}
        </View>
        {item.summary ? <Text className="mt-4 text-base font-medium leading-7 text-muted">{item.summary}</Text> : null}
        <Text className="mt-4 text-base leading-8 text-foreground">{item.body}</Text>

        {item.media.length ? (
          <View className="mt-5 gap-3">
            {item.media.map((media) => media.mediaType === "image"
              ? <Image key={media.id} source={{ uri: contentMediaUrl(media.fileId) }} className="h-64 w-full rounded-xl" contentFit="cover" />
              : <ContentVideo key={media.id} fileId={media.fileId} />)}
          </View>
        ) : null}

        {item.tags.length ? <Text className="mt-4 text-sm text-primary">{item.tags.map((tag) => `#${tag.name}`).join("  ")}</Text> : null}

        {item.relations.length ? (
          <View className="mt-6">
            <Text className="mb-3 text-lg font-bold text-foreground">关联对象</Text>
            {item.relations.map((relation) => (
              <Pressable key={relation.id} onPress={() => void navigateRelation(relation)} className="mb-2 rounded-2xl border border-primary/20 bg-primary/10 p-4">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-xs text-muted">{RELATION_LABELS[relation.relationType] ?? relation.relationType}</Text>
                    <Text className="mt-1 font-bold text-foreground">{relation.relationLabel || `#${relation.relationId}`}</Text>
                  </View>
                  {["product", "product_unit"].includes(relation.relationType) ? <TrustBadge label={relation.relationType === "product_unit" ? "进入产品护照" : "已关联产品身份"} /> : null}
                  <Text className="text-primary">进入 ›</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="mt-6 flex-row flex-wrap gap-2">
          <PrimaryButton title={`${item.viewer.liked ? "已赞" : "点赞"} ${item.metrics?.likeCount ?? 0}`} onPress={() => void interact("like")} small variant={item.viewer.liked ? "primary" : "outline"} />
          <PrimaryButton title={`${item.viewer.favorited ? "已收藏" : "收藏"} ${item.metrics?.favoriteCount ?? 0}`} onPress={() => void interact("favorite")} small variant={item.viewer.favorited ? "primary" : "outline"} />
          <PrimaryButton title="分享" onPress={() => void share()} small variant="outline" />
          <PrimaryButton title="举报" onPress={() => isAuthenticated ? setReportOpen(true) : startLogin()} small variant="muted" />
        </View>
        <Text className="mt-2 text-xs text-muted">浏览 {item.metrics?.viewCount ?? 0} · 评论 {item.metrics?.commentCount ?? 0}</Text>

        {reportOpen ? (
          <View className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
            <Text className="font-bold text-foreground">举报内容</Text>
            <AppTextInput value={reportDetail} onChangeText={setReportDetail} placeholder="请说明问题（可选）" multiline maxLength={1000} />
            <View className="mt-3 flex-row gap-2"><PrimaryButton title="取消" onPress={() => setReportOpen(false)} small variant="muted" /><PrimaryButton title="提交举报" onPress={() => void submitReport()} small variant="danger" /></View>
          </View>
        ) : null}
        {message ? <Text className="mt-3 text-sm text-primary">{message}</Text> : null}

        <View className="mt-7">
          <Text className="text-lg font-bold text-foreground">评论</Text>
          {item.allowComments ? (
            <View className="mt-3 flex-row gap-2">
              <AppTextInput value={comment} onChangeText={setComment} placeholder={isAuthenticated ? "写下有帮助的评论" : "登录后评论"} style={{ flex: 1 }} />
              <PrimaryButton title="发送" onPress={() => void sendComment()} small disabled={!comment.trim()} />
            </View>
          ) : <Text className="mt-2 text-sm text-muted">作者已关闭评论。</Text>}
          {item.comments.map((entry) => (
            <View key={entry.id} className="mt-3 rounded-xl border border-border bg-surface p-3">
              <Text className="text-xs font-semibold text-muted">{entry.authorName || `用户 ${entry.authorAccountId}`}</Text>
              <Text className="mt-1 text-sm leading-6 text-foreground">{entry.body}</Text>
            </View>
          ))}
          {!item.comments.length ? <Text className="mt-3 text-sm text-muted">还没有评论，发布第一条有帮助的反馈。</Text> : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
