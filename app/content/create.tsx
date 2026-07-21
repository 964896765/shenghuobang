import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ListingImagePicker } from "@/components/listing-images";
import { AIHintBar, AppTextInput, ChipSelector, FieldLabel, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { StickyActionBar } from "@/components/trust-ui";
import { type ContentMediaDraft, uploadContentMedia } from "@/lib/content-media";
import { useGlobalLocation } from "@/lib/location-context";
import { useRole } from "@/lib/role-context";
import { trpc } from "@/lib/trpc";
import {
  CONTENT_SOURCE_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  type ContentSourceType,
  type ContentType,
  newContentRequestId,
} from "@/shared/content";

type RelationType = "demand" | "idea" | "funding_project" | "product" | "product_unit" | "listing" | "repair" | "service" | "donation" | "recycling" | "account" | "organization";
type RelationDraft = { key: string; relationType: RelationType; relationId: string; relationLabel: string };

const visibilityOptions = [
  { value: "public", label: "公开" },
  { value: "followers", label: "仅关注者" },
  { value: "private", label: "私密草稿" },
] as const;

const relationOptions: { value: RelationType; label: string }[] = [
  { value: "product", label: "产品" }, { value: "product_unit", label: "产品护照" },
  { value: "idea", label: "创意" }, { value: "funding_project", label: "新品筹措" },
  { value: "repair", label: "维修需求" }, { value: "service", label: "服务商" },
  { value: "listing", label: "商品" }, { value: "demand", label: "需求" },
];

function validType(value?: string): ContentType {
  return CONTENT_TYPE_OPTIONS.some((option) => option.value === value) ? value as ContentType : "post";
}

function ContentEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { activeIdentityId, activeOrganizationId } = useRole();
  const location = useGlobalLocation();
  const utils = trpc.useUtils();
  const createDraft = trpc.content.createDraft.useMutation();
  const saveDraft = trpc.content.saveDraft.useMutation();
  const replaceMedia = trpc.content.replaceMedia.useMutation();
  const replaceRelations = trpc.content.replaceRelations.useMutation();
  const publish = trpc.content.publish.useMutation();
  const aiSuggest = trpc.content.aiSuggest.useMutation();
  const confirmAi = trpc.content.confirmAi.useMutation();
  const [postId, setPostId] = useState<number | null>(null);
  const [contentType, setContentType] = useState<ContentType>(() => validType(params.type));
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [locationLabel, setLocationLabel] = useState(location.region ?? "");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [sourceType, setSourceType] = useState<ContentSourceType>("personal_experience");
  const [sourceStatement, setSourceStatement] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [images, setImages] = useState<ContentMediaDraft[]>([]);
  const [videos, setVideos] = useState<ContentMediaDraft[]>([]);
  const [relations, setRelations] = useState<RelationDraft[]>([]);
  const [relationType, setRelationType] = useState<RelationType>("product");
  const [relationId, setRelationId] = useState("");
  const [relationLabel, setRelationLabel] = useState("");
  const [aiResult, setAiResult] = useState<{ title: string; summary: string | null; tags: string[]; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autosaveReady = useRef(false);

  useEffect(() => setContentType(validType(params.type)), [params.type]);

  const tagValues = useMemo(() => tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 10), [tags]);
  const draftValues = () => ({
    contentType,
    title: title.trim(),
    summary: summary.trim() || null,
    body: body.trim(),
    locationLabel: locationLabel.trim() || null,
    visibility,
    sourceType,
    sourceStatement: sourceStatement.trim() || null,
    allowComments,
    authorIdentityId: activeIdentityId,
    organizationId: sourceType === "organization_official" ? activeOrganizationId : null,
    tags: tagValues,
  });

  const validate = () => {
    if (!title.trim()) throw new Error("请填写标题");
    if (!body.trim()) throw new Error("请填写正文");
    if (!sourceStatement.trim()) throw new Error("请填写来源声明，说明内容依据");
    if (sourceType === "organization_official" && !activeOrganizationId) throw new Error("当前未选择组织工作台，不能声明为组织官方内容");
  };

  const saveBase = async () => {
    validate();
    if (!postId) {
      const created = await createDraft.mutateAsync({ ...draftValues(), requestId: newContentRequestId("create") });
      setPostId(created.id);
      autosaveReady.current = true;
      return created.id;
    }
    await saveDraft.mutateAsync({ postId, ...draftValues(), requestId: newContentRequestId("save") });
    return postId;
  };

  const syncAttachments = async (targetId: number) => {
    const drafts = [...images, ...videos];
    const uploaded = [] as { fileId: number; mediaType: "image" | "video"; purpose: "cover" | "body"; sortOrder: number }[];
    for (const [index, media] of drafts.entries()) {
      setMessage(`正在上传媒体 ${index + 1}/${drafts.length}`);
      const fileId = await uploadContentMedia(targetId, media);
      uploaded.push({ fileId, mediaType: media.mimeType.startsWith("video/") ? "video" : "image", purpose: index === 0 ? "cover" : "body", sortOrder: index });
    }
    await replaceMedia.mutateAsync({ postId: targetId, media: uploaded, requestId: newContentRequestId("media") });
    await replaceRelations.mutateAsync({
      postId: targetId,
      relations: relations.map((item) => ({ relationType: item.relationType, relationId: Number(item.relationId), relationLabel: item.relationLabel.trim() || undefined })),
      requestId: newContentRequestId("relations"),
    });
  };

  const persist = async (action: "save" | "preview" | "publish") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const targetId = await saveBase();
      await syncAttachments(targetId);
      if (action === "publish") {
        setMessage("正在执行发布校验…");
        await publish.mutateAsync({ postId: targetId, requestId: newContentRequestId("publish") });
        await Promise.all([utils.content.discover.invalidate(), utils.content.mine.invalidate(), utils.content.creatorDashboard.invalidate()]);
        router.replace(`/content/${targetId}` as never);
      } else if (action === "preview") {
        router.push(`/content/${targetId}?preview=1` as never);
      } else {
        setMessage("草稿已保存");
        setTimeout(() => setMessage(""), 1500);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请稍后重试");
    } finally {
      setBusy(false);
      if (message.startsWith("正在")) setMessage("");
    }
  };

  useEffect(() => {
    if (!postId || !autosaveReady.current || busy || !title.trim() || !body.trim() || !sourceStatement.trim()) return;
    const timer = setTimeout(() => {
      saveDraft.mutate({ postId, ...draftValues(), requestId: newContentRequestId("autosave") }, {
        onSuccess: () => setMessage("已自动保存"),
        onError: () => setMessage("自动保存失败，可点击底部保存重试"),
      });
    }, 1800);
    return () => clearTimeout(timer);
    // draft fields intentionally drive the autosave debounce.
  // draftValues intentionally reads the current form snapshot for this debounce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, title, summary, body, tags, locationLabel, visibility, sourceType, sourceStatement, allowComments]);

  const requestAi = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const targetId = await saveBase();
      const result = await aiSuggest.mutateAsync({ postId: targetId });
      setAiResult({ title: result.title, summary: result.summary ?? null, tags: result.tags, provider: result.provider });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 辅助失败");
    } finally {
      setBusy(false);
    }
  };

  const applyAi = async () => {
    if (!postId || !aiResult) return;
    setBusy(true);
    try {
      const confirmed = await confirmAi.mutateAsync({ postId, title: aiResult.title, summary: aiResult.summary, tags: aiResult.tags, requestId: newContentRequestId("confirm-ai") });
      setTitle(confirmed.title);
      setSummary(confirmed.summary ?? "");
      setTags(aiResult.tags.join(", "));
      setSourceType("ai_assisted");
      setAiResult(null);
      setMessage("AI 整理结果已由你确认");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认失败");
    } finally {
      setBusy(false);
    }
  };

  const pickVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "video/mp4", copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > 8 * 1024 * 1024) return setError("视频不能超过 8MB");
    setVideos([{ key: `video-${Date.now()}`, uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "video/mp4", size: asset.size ?? 0 }]);
  };

  const addRelation = () => {
    const id = Number(relationId);
    if (!Number.isSafeInteger(id) || id <= 0) return setError("请输入有效的关联对象 ID");
    setRelations((current) => [...current.filter((item) => !(item.relationType === relationType && item.relationId === relationId)), { key: `${relationType}:${id}`, relationType, relationId: String(id), relationLabel }]);
    setRelationId("");
    setRelationLabel("");
    setError("");
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="内容创作" right={postId ? <Text className="text-xs text-muted">草稿 #{postId}</Text> : undefined} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <FieldLabel label="内容类型" required />
          <ChipSelector options={[...CONTENT_TYPE_OPTIONS]} value={contentType} onChange={setContentType} />
          <FieldLabel label="标题" required />
          <AppTextInput value={title} onChangeText={setTitle} placeholder="用一句话说明这篇内容" maxLength={180} />
          <FieldLabel label="摘要" />
          <AppTextInput value={summary} onChangeText={setSummary} placeholder="用于发现卡片展示，可由 AI 辅助整理" maxLength={500} multiline />
          <FieldLabel label="正文" required />
          <AppTextInput value={body} onChangeText={setBody} placeholder="写下真实过程、事实依据与结论边界" maxLength={50_000} multiline style={{ minHeight: 180 }} />

          <FieldLabel label="图片与封面" />
          <ListingImagePicker images={images} onChange={setImages} disabled={busy} onError={setError} />
          <FieldLabel label="视频" />
          <View className="flex-row items-center gap-3">
            <PrimaryButton title={videos.length ? "更换 MP4" : "选择 MP4"} onPress={() => void pickVideo()} small variant="outline" />
            <Text className="flex-1 text-xs text-muted" numberOfLines={2}>{videos[0]?.name ?? "当前未选择视频；单个文件不超过 8MB"}</Text>
          </View>

          <FieldLabel label="标签" />
          <AppTextInput value={tags} onChangeText={setTags} placeholder="维修, 家电, 真实体验（逗号分隔）" />
          <FieldLabel label="模糊位置" />
          <AppTextInput value={locationLabel} onChangeText={setLocationLabel} placeholder="仅填写城市或区域，不要填写详细住址" maxLength={100} />
          <FieldLabel label="可见范围" required />
          <ChipSelector options={[...visibilityOptions]} value={visibility} onChange={setVisibility} />
          <FieldLabel label="内容来源" required />
          <ChipSelector options={CONTENT_SOURCE_OPTIONS.map(({ value, label }) => ({ value, label }))} value={sourceType} onChange={setSourceType} />
          <Text className="mt-2 text-xs leading-5 text-muted">{CONTENT_SOURCE_OPTIONS.find((item) => item.value === sourceType)?.help}</Text>
          <FieldLabel label="来源声明" required />
          <AppTextInput value={sourceStatement} onChangeText={setSourceStatement} placeholder="例如：本人购买并连续使用 30 天后的真实体验" maxLength={500} multiline />

          <View className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <Text className="text-base font-bold text-foreground">关联业务对象</Text>
            <Text className="mt-1 text-xs leading-5 text-muted">填写现有对象 ID。保存时服务端会校验对象存在性与当前账号的访问权，私密创意和内部项目不能越权关联。</Text>
            <View className="mt-3"><ChipSelector options={relationOptions} value={relationType} onChange={setRelationType} /></View>
            <View className="mt-3 flex-row gap-2">
              <AppTextInput value={relationId} onChangeText={setRelationId} placeholder="对象 ID" keyboardType="number-pad" style={{ flex: 1 }} />
              <AppTextInput value={relationLabel} onChangeText={setRelationLabel} placeholder="显示名称（可选）" style={{ flex: 2 }} />
            </View>
            <View className="mt-2"><PrimaryButton title="添加关联" onPress={addRelation} small variant="outline" /></View>
            {relations.map((item) => (
              <Pressable key={item.key} onPress={() => setRelations((current) => current.filter((entry) => entry.key !== item.key))} className="mt-2 rounded-lg bg-primary/10 px-3 py-2">
                <Text className="text-xs text-primary">{relationOptions.find((option) => option.value === item.relationType)?.label} #{item.relationId} {item.relationLabel} · 点击移除</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setAllowComments((value) => !value)} className="mt-4 flex-row items-center justify-between rounded-xl border border-border bg-surface p-4">
            <Text className="font-medium text-foreground">允许评论</Text>
            <Text className={allowComments ? "font-semibold text-primary" : "text-muted"}>{allowComments ? "已开启" : "已关闭"}</Text>
          </Pressable>

          <View className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <AIHintBar text="AI 只会整理你已填写的内容，不会自动发布，也不会标记为平台已核验。" />
            <PrimaryButton title="AI 辅助生成标题、摘要和标签" onPress={() => void requestAi()} loading={busy && aiSuggest.isPending} variant="outline" />
            {aiResult ? (
              <View className="mt-3 rounded-xl bg-surface p-3">
                <Text className="font-bold text-foreground">{aiResult.title}</Text>
                <Text className="mt-1 text-sm text-muted">{aiResult.summary}</Text>
                <Text className="mt-1 text-xs text-muted">标签：{aiResult.tags.join("、") || "无"} · {aiResult.provider === "local_fallback" ? "本地整理" : "已配置 AI"}</Text>
                <View className="mt-3"><PrimaryButton title="采用并确认 AI 结果" onPress={() => void applyAi()} small /></View>
              </View>
            ) : null}
          </View>
          {error ? <Text className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-error">{error}</Text> : null}
          {message ? <Text className="mt-3 text-center text-sm text-primary">{message}</Text> : null}
        </ScrollView>
        <StickyActionBar>
          <View className="flex-row gap-2">
            <View className="flex-1"><PrimaryButton title="保存草稿" onPress={() => void persist("save")} loading={busy} variant="muted" /></View>
            <View className="flex-1"><PrimaryButton title="预览" onPress={() => void persist("preview")} disabled={busy} variant="outline" /></View>
            <View className="flex-1"><PrimaryButton title="发布" onPress={() => void persist("publish")} disabled={busy || visibility === "private"} /></View>
          </View>
        </StickyActionBar>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

export default function CreateContentScreen() {
  return <AuthGate title="登录后创作内容"><ContentEditor /></AuthGate>;
}
