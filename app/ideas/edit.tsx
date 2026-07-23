import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, EmptyState, FieldLabel, LoadingView, PrimaryButton } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  StableIdeaRequestIds,
  ideaErrorMessage,
  uploadIdeaStoredFile,
  type IdeaAttachmentType,
  type IdeaConfidentiality,
  type IdeaListItem,
  type IdeaVisibility,
} from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

type LocalAttachment = { key: string; uri: string; name: string; mimeType: string; type: IdeaAttachmentType; confidentiality: IdeaConfidentiality };

const visibilityOptions = [
  { value: "public", label: "公开" },
  { value: "private", label: "私密" },
  { value: "nda", label: "需保密协议" },
] satisfies { value: IdeaVisibility; label: string }[];
const attachmentTypes = [
  { value: "cover", label: "封面" }, { value: "reference", label: "参考" }, { value: "design", label: "设计" }, { value: "other", label: "其他" },
] satisfies { value: IdeaAttachmentType; label: string }[];
const confidentialityOptions = [
  { value: "PUBLIC", label: "公开" }, { value: "INTERNAL", label: "内部" }, { value: "CONFIDENTIAL", label: "机密" }, { value: "NDA", label: "NDA" }, { value: "RESTRICTED", label: "严格受限" },
] satisfies { value: IdeaConfidentiality; label: string }[];

function Editor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ideaId?: string }>();
  const initialIdeaId = Number(params.ideaId);
  const editing = Number.isSafeInteger(initialIdeaId) && initialIdeaId > 0;
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const identityQuery = trpc.identity.listMine.useQuery();
  const detailQuery = trpc.ideas.detail.useQuery({ ideaId: editing ? initialIdeaId : 1 }, { enabled: editing });
  const createMutation = trpc.ideas.createDraft.useMutation();
  const updateMutation = trpc.ideas.updateDraft.useMutation();
  const publishMutation = trpc.ideas.publish.useMutation();
  const uploadAttachmentMutation = trpc.ideas.uploadAttachment.useMutation();
  const [ideaId, setIdeaId] = useState<number | null>(editing ? initialIdeaId : null);
  const [identityId, setIdentityId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<IdeaVisibility>("public");
  const [authorizationVersion, setAuthorizationVersion] = useState<number | undefined>();
  const [attachmentType, setAttachmentType] = useState<IdeaAttachmentType>("reference");
  const [confidentialityLevel, setConfidentialityLevel] = useState<IdeaConfidentiality>("INTERNAL");
  const [files, setFiles] = useState<LocalAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const activeIdentities = useMemo(() => (identityQuery.data ?? []).filter((identity) => identity.status === "active"), [identityQuery.data]);
  useEffect(() => {
    if (identityId == null && activeIdentities[0]) setIdentityId(activeIdentities[0].id);
  }, [activeIdentities, identityId]);
  useEffect(() => {
    const result = detailQuery.data;
    if (!result || result.limited) return;
    const idea = result.idea as unknown as IdeaListItem & { description?: string; creatorIdentityId?: number };
    setTitle(String(idea.title ?? ""));
    setSummary(String(idea.summary ?? ""));
    setDescription(String(idea.description ?? ""));
    setCategoryCode(String(idea.categoryCode ?? ""));
    setTags((idea.tags ?? []).join(", "));
    setVisibility(idea.visibility ?? "public");
    setAuthorizationVersion(idea.authorizationVersion ?? undefined);
    if (idea.creatorIdentityId) setIdentityId(idea.creatorIdentityId);
  }, [detailQuery.data]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 8 * 1024 * 1024) return setError("单个附件不能超过 8MB。");
      setFiles((current) => [...current, {
        key: `${Date.now()}-${asset.name}`,
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        type: attachmentType,
        confidentiality: visibility === "nda" && confidentialityLevel === "PUBLIC" ? "NDA" : confidentialityLevel,
      }].slice(0, 10));
    } catch (cause) {
      setError(ideaErrorMessage(cause));
    }
  };

  const persist = async (publish: boolean) => {
    if (submitting) return;
    if (!identityId) return setError("请选择一个有效业务身份；没有可用身份时请先前往身份与工作台创建。 ");
    if (!title.trim() || !summary.trim() || !description.trim() || !categoryCode.trim()) return setError("请完整填写标题、简介、详细描述和分类。");
    setSubmitting(true);
    setError("");
    try {
      let targetId = ideaId;
      let version = authorizationVersion;
      if (!targetId) {
        const operationKey = "create-draft";
        const created = await createMutation.mutateAsync({
          creatorIdentityId: identityId,
          title: title.trim(), summary: summary.trim(), description: description.trim(), categoryCode: categoryCode.trim(),
          tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20), visibility,
          requestId: requests.get(operationKey),
        });
        requests.complete(operationKey);
        targetId = created.id;
        version = created.authorizationVersion;
        setIdeaId(targetId);
        setAuthorizationVersion(version);
      } else {
        const operationKey = `update-${targetId}`;
        const updated = await updateMutation.mutateAsync({
          ideaId: targetId,
          title: title.trim(), summary: summary.trim(), description: description.trim(), categoryCode: categoryCode.trim(),
          tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20), visibility,
          expectedAuthorizationVersion: version,
          requestId: requests.get(operationKey),
        });
        requests.complete(operationKey);
        version = updated.authorizationVersion;
        setAuthorizationVersion(version);
      }
      for (const [index, file] of files.entries()) {
        setProgress(`正在上传附件 ${index + 1}/${files.length}`);
        const uploadKey = `file-${targetId}-${file.key}`;
        const fileId = await uploadIdeaStoredFile({ uri: file.uri, name: file.name, mimeType: file.mimeType, requestId: requests.get(uploadKey) });
        const attachKey = `attach-${targetId}-${file.key}`;
        await uploadAttachmentMutation.mutateAsync({
          ideaId: targetId, fileId, attachmentType: file.type, confidentialityLevel: file.confidentiality,
          sortOrder: index, requestId: requests.get(attachKey),
        });
        requests.complete(uploadKey);
        requests.complete(attachKey);
      }
      setFiles([]);
      if (publish) {
        setProgress("正在发布创意…");
        const publishKey = `publish-${targetId}`;
        const published = await publishMutation.mutateAsync({ ideaId: targetId, expectedAuthorizationVersion: version, requestId: requests.get(publishKey) });
        requests.complete(publishKey);
        setAuthorizationVersion(published.authorizationVersion);
      }
      await Promise.all([utils.ideas.listMine.invalidate(), utils.ideas.listPublic.invalidate(), utils.ideas.detail.invalidate({ ideaId: targetId })]);
      router.replace((publish ? `/ideas/${targetId}` : "/ideas/mine") as never);
    } catch (cause) {
      setError(ideaErrorMessage(cause));
    } finally {
      setProgress("");
      setSubmitting(false);
    }
  };

  if (identityQuery.isLoading || (editing && detailQuery.isLoading)) return <LoadingView />;
  if (identityQuery.isError) return <EmptyState title="身份加载失败" hint={ideaErrorMessage(identityQuery.error)} actionTitle="重试" onAction={() => identityQuery.refetch()} />;
  if (!activeIdentities.length) return <EmptyState title="没有可用业务身份" hint="创建创意必须选择服务端返回的有效身份。" actionTitle="前往身份与工作台" onAction={() => router.push("/workspaces" as never)} />;
  if (editing && detailQuery.isError) return <EmptyState title="无法编辑该创意" hint={ideaErrorMessage(detailQuery.error)} actionTitle="重试" onAction={() => detailQuery.refetch()} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className="bg-surface rounded-2xl border border-border p-4">
          <FieldLabel label="创意身份" required />
          <View className="flex-row flex-wrap gap-2">
            {activeIdentities.map((identity) => <Pressable key={identity.id} disabled={editing} onPress={() => setIdentityId(identity.id)}><Text className={identityId === identity.id ? "bg-primary text-white px-3 py-2 rounded-full" : "bg-background border border-border text-foreground px-3 py-2 rounded-full"}>{identity.displayName || identity.typeName} · {identity.typeCode}</Text></Pressable>)}
          </View>
          <FieldLabel label="标题" required /><AppTextInput value={title} onChangeText={setTitle} maxLength={160} placeholder="一句话说明你的创意" />
          <FieldLabel label="简介" required /><AppTextInput value={summary} onChangeText={setSummary} maxLength={500} multiline placeholder="用几句话说明价值、使用场景和目标" />
          <FieldLabel label="详细描述" required /><AppTextInput value={description} onChangeText={setDescription} maxLength={20_000} multiline placeholder="描述问题、构想、约束和希望合作的部分" />
          <FieldLabel label="分类" required /><AppTextInput value={categoryCode} onChangeText={setCategoryCode} maxLength={64} placeholder="例如：智能家居、绿色设计" />
          <FieldLabel label="标签（逗号分隔，最多 20 个）" /><AppTextInput value={tags} onChangeText={setTags} maxLength={800} placeholder="原型, 可持续, 家居" />
          <FieldLabel label="可见性" required /><ChipSelector options={visibilityOptions} value={visibility} onChange={setVisibility} />
          {visibility === "nda" ? <Text className="text-xs text-action mt-2">受邀者接受 NDA 前只能看到有限摘要，附件不会展示。</Text> : null}
        </View>

        <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
          <Text className="text-base font-semibold text-foreground">封面与附件</Text>
          <Text className="text-xs text-muted mt-1">先保存草稿，再通过受控文件流程关联；客户端不会提交 storageKey 或永久 URL。</Text>
          <FieldLabel label="附件类型" /><ChipSelector options={attachmentTypes} value={attachmentType} onChange={setAttachmentType} />
          <FieldLabel label="保密级别" /><ChipSelector options={confidentialityOptions} value={confidentialityLevel} onChange={setConfidentialityLevel} />
          <View className="mt-3"><PrimaryButton title="选择附件" variant="outline" onPress={pickFile} disabled={files.length >= 10} /></View>
          {files.map((file) => <View key={file.key} className="flex-row items-center border-b border-border py-2"><Text className="text-sm text-foreground flex-1" numberOfLines={1}>{file.name} · {file.type}</Text><Pressable onPress={() => setFiles((current) => current.filter((item) => item.key !== file.key))}><Text className="text-sm text-error">移除</Text></Pressable></View>)}
        </View>

        {progress ? <Text className="text-sm text-primary mt-4 text-center">{progress}</Text> : null}
        {error ? <Text className="text-sm text-error mt-4 leading-5">{error}</Text> : null}
        <View className="flex-row gap-3 mt-5">
          <View className="flex-1"><PrimaryButton title="保存草稿" variant="outline" loading={submitting && !progress.includes("发布")} disabled={submitting} onPress={() => persist(false)} /></View>
          <View className="flex-1"><PrimaryButton title="发布" loading={submitting} disabled={submitting} onPress={() => persist(true)} /></View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function IdeaEditorScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="创建或编辑创意" /><AuthGate title="登录后创建创意"><Editor /></AuthGate></ScreenContainer>;
}
