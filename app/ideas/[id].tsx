import { useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { ConfirmDialog, EmptyState, ErrorState, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import {
  IDEA_STATUS_LABELS,
  IDEA_VISIBILITY_LABELS,
  StableIdeaRequestIds,
  ideaErrorMessage,
  openIdeaAttachmentAccessPath,
  type IdeaAttachmentType,
  type IdeaListItem,
  type IdeaStatus,
  type IdeaVisibility,
} from "@/lib/idea-app";
import { trpc } from "@/lib/trpc";

type DetailAttachment = {
  id: number;
  attachmentType?: IdeaAttachmentType | null;
  confidentialityLevel?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

function formatSize(value?: number | null) {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function IdeaDetailContent() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const ideaId = Number(rawId);
  const validId = Number.isSafeInteger(ideaId) && ideaId > 0;
  const utils = trpc.useUtils();
  const requests = useRef(new StableIdeaRequestIds()).current;
  const detail = trpc.ideas.detail.useQuery({ ideaId }, { enabled: validId });
  const mine = trpc.ideas.listMine.useQuery({ limit: 50 }, { enabled: validId });
  const owner = Boolean(mine.data?.some((item) => item.id === ideaId));
  const sentInvitations = trpc.ideas.listInvitations.useQuery(
    { direction: "sent", ideaId, limit: 50 },
    { enabled: validId && owner },
  );
  const archiveMutation = trpc.ideas.archive.useMutation();
  const disableMutation = trpc.ideas.disableAttachment.useMutation();
  const accessMutation = trpc.ideas.attachmentAccess.useMutation();
  const convertMutation = trpc.ideas.convertToProject.useMutation();
  const [confirm, setConfirm] = useState<"archive" | "convert" | null>(null);
  const [busyAttachmentId, setBusyAttachmentId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const acceptedCollaborators = useMemo(
    () => (sentInvitations.data ?? []).filter((item) => item.status === "accepted"),
    [sentInvitations.data],
  );
  const result = detail.data;
  const idea = (result?.idea ?? null) as (IdeaListItem & { description?: string | null; creatorIdentityId?: number | null }) | null;
  const attachments = (result?.attachments ?? []) as DetailAttachment[];

  const refresh = async () => {
    await Promise.all([detail.refetch(), mine.refetch(), owner ? sentInvitations.refetch() : Promise.resolve()]);
  };
  const archive = async () => {
    const operation = `archive-${ideaId}`;
    try {
      await archiveMutation.mutateAsync({ ideaId, requestId: requests.get(operation) });
      requests.complete(operation);
      setConfirm(null);
      setError("");
      await Promise.all([utils.ideas.detail.invalidate({ ideaId }), utils.ideas.listMine.invalidate(), utils.ideas.listPublic.invalidate()]);
    } catch (cause) { setError(ideaErrorMessage(cause)); setConfirm(null); }
  };
  const disableAttachment = async (attachmentId: number) => {
    const operation = `disable-${ideaId}-${attachmentId}`;
    setBusyAttachmentId(attachmentId);
    try {
      await disableMutation.mutateAsync({ ideaId, attachmentId, requestId: requests.get(operation) });
      requests.complete(operation);
      setError("");
      await utils.ideas.detail.invalidate({ ideaId });
    } catch (cause) { setError(ideaErrorMessage(cause)); }
    finally { setBusyAttachmentId(null); }
  };
  const openAttachment = async (attachmentId: number) => {
    const operation = `attachment-${attachmentId}`;
    setBusyAttachmentId(attachmentId);
    try {
      const access = await accessMutation.mutateAsync({ attachmentId, purpose: "preview", requestId: requests.get(operation) });
      await openIdeaAttachmentAccessPath(access.path);
      requests.complete(operation);
      setError("");
    } catch (cause) {
      setError(ideaErrorMessage(cause));
      await utils.ideas.detail.invalidate({ ideaId });
    } finally { setBusyAttachmentId(null); }
  };
  const convert = async () => {
    const operation = `convert-${ideaId}`;
    try {
      const converted = await convertMutation.mutateAsync({ ideaId, requestId: requests.get(operation) });
      requests.complete(operation);
      setConfirm(null);
      setError("");
      await Promise.all([utils.ideas.detail.invalidate({ ideaId }), utils.ideas.listMine.invalidate()]);
      router.replace(`/projects/${converted.projectId}` as never);
    } catch (cause) { setError(ideaErrorMessage(cause)); setConfirm(null); }
  };

  if (!validId) return <EmptyState title="创意不存在或你暂时无权访问" />;
  if (detail.isLoading) return <LoadingView text="正在加载创意…" />;
  if (detail.isError) return <ErrorState title="无法查看创意" hint={ideaErrorMessage(detail.error)} onRetry={refresh} />;
  if (!idea) return <EmptyState title="创意不存在或你暂时无权访问" />;
  const status = (idea.status ?? "draft") as IdeaStatus;
  const visibility = (idea.visibility ?? "private") as IdeaVisibility;

  return (
    <>
      <ScrollView
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
      >
        <View className="bg-surface border border-border rounded-2xl p-4">
          <View className="flex-row gap-2 mb-3">
            <StatusBadge label={IDEA_STATUS_LABELS[status]} tone={status === "archived" ? "gray" : status === "converted" ? "green" : "blue"} />
            <StatusBadge label={IDEA_VISIBILITY_LABELS[visibility]} tone={visibility === "public" ? "green" : visibility === "nda" ? "orange" : "gray"} />
          </View>
          <Text className="text-2xl font-bold text-foreground">{idea.title || "未命名创意"}</Text>
          <Text className="text-sm text-muted mt-2">创意发起人 · {idea.creatorIdentityId ? `业务身份 #${idea.creatorIdentityId}` : "身份信息按权限展示"}</Text>
          {idea.categoryCode ? <Text className="text-sm text-muted mt-3">分类：{idea.categoryCode}</Text> : null}
          {idea.tags?.length ? <Text className="text-sm text-muted mt-1">标签：{idea.tags.join(" · ")}</Text> : null}
          <Text className="text-base text-foreground leading-7 mt-4">{idea.summary || "暂无简介"}</Text>
          {!result?.limited && idea.description ? <Text className="text-base text-foreground leading-7 mt-4">{idea.description}</Text> : null}
        </View>

        {result?.limited ? (
          <View className="bg-warning/10 border border-warning/30 rounded-2xl p-4 mt-4">
            <Text className="text-base font-bold text-foreground">接受 NDA 后查看完整内容</Text>
            <Text className="text-sm text-muted mt-2">当前仅展示有限摘要，受保护内容和附件未下载、未缓存。</Text>
            <View className="mt-3"><PrimaryButton title="查看保密协议" onPress={() => router.push({ pathname: "/ideas/nda", params: { ideaId: String(ideaId) } } as never)} /></View>
          </View>
        ) : null}

        {!result?.limited ? (
          <View className="mt-5">
            <Text className="text-lg font-bold text-foreground mb-3">受控附件</Text>
            {attachments.length === 0 ? <EmptyState title="暂无可查看附件" /> : attachments.map((attachment) => (
              <View key={attachment.id} className="bg-surface border border-border rounded-2xl p-4 mb-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">{attachment.originalName || `${attachment.attachmentType ?? "other"} 附件`}</Text>
                    <Text className="text-xs text-muted mt-1">{attachment.confidentialityLevel ?? "受控"}{formatSize(attachment.sizeBytes) ? ` · ${formatSize(attachment.sizeBytes)}` : ""}</Text>
                  </View>
                  <PrimaryButton small title="查看" loading={busyAttachmentId === attachment.id && accessMutation.isPending} disabled={busyAttachmentId != null} onPress={() => openAttachment(attachment.id)} />
                </View>
                {owner ? <Pressable disabled={busyAttachmentId != null} onPress={() => disableAttachment(attachment.id)} className="mt-3"><Text className="text-sm text-error">停止展示此附件</Text></Pressable> : null}
              </View>
            ))}
          </View>
        ) : null}

        {owner ? (
          <View className="bg-surface border border-border rounded-2xl p-4 mt-4 gap-3">
            <Text className="text-lg font-bold text-foreground">创意管理</Text>
            {status === "draft" ? <PrimaryButton title="继续编辑和发布" onPress={() => router.push({ pathname: "/ideas/edit", params: { ideaId: String(ideaId) } } as never)} /> : null}
            {!['archived', 'converted'].includes(status) ? <PrimaryButton title="邀请协作者" variant="outline" onPress={() => router.push({ pathname: "/ideas/invite", params: { ideaId: String(ideaId), visibility } } as never)} /> : null}
            {visibility === "nda" ? <PrimaryButton title="查看 NDA" variant="outline" onPress={() => router.push({ pathname: "/ideas/nda", params: { ideaId: String(ideaId) } } as never)} /> : null}
            {['published', 'collaborating'].includes(status) ? <PrimaryButton title="发起新品筹措" variant="outline" onPress={() => router.push({ pathname: "/funding/new", params: { sourceType: "idea", sourceId: String(ideaId) } } as never)} /> : null}
            {['published', 'collaborating'].includes(status) ? <PrimaryButton title="转为项目" loading={convertMutation.isPending} disabled={convertMutation.isPending} onPress={() => setConfirm("convert")} /> : null}
            {status === "converted" && idea.convertedProjectId ? <PrimaryButton title="进入项目详情" onPress={() => router.push(`/projects/${idea.convertedProjectId}` as never)} /> : null}
            {status !== "archived" ? <PrimaryButton title="归档创意" variant="danger" loading={archiveMutation.isPending} disabled={archiveMutation.isPending} onPress={() => setConfirm("archive")} /> : null}
          </View>
        ) : null}

        {error ? <Text className="text-sm text-error mt-4">{error}</Text> : null}
      </ScrollView>
      <ConfirmDialog
        visible={confirm === "archive"}
        title="归档创意"
        message="归档后将从公开列表移除，但不会删除内容。"
        confirmText="确认归档"
        danger
        loading={archiveMutation.isPending}
        onConfirm={archive}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === "convert"}
        title="转为项目"
        message={acceptedCollaborators.length
          ? `将创建项目并加入 ${acceptedCollaborators.length} 位已接受协作者；viewer 仅获得只读角色。`
          : "转项目需要至少一位已接受的工程师。服务端将再次核验成员和角色。"}
        confirmText="确认转换"
        loading={convertMutation.isPending}
        onConfirm={convert}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

export default function IdeaDetailScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="创意详情" />
      <AuthGate title="登录后查看创意"><IdeaDetailContent /></AuthGate>
    </ScreenContainer>
  );
}
