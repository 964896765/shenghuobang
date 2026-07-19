import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";

import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, ConfirmDialog, EmptyState, ErrorState, FieldLabel, InfoRow, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { ScreenContainer } from "@/components/screen-container";
import { formatTime } from "@/lib/labels";
import {
  ControlledAccessTracker,
  DESIGN_FILE_ROLE_LABELS,
  DESIGN_VERSION_STATUS_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
  readLocalFileBase64,
} from "@/lib/project-design-prototype-app";
import { trpc } from "@/lib/trpc";

const FILE_ROLE_OPTIONS = [
  { value: "source", label: "源文件" },
  { value: "preview", label: "预览图" },
  { value: "reference", label: "参考资料" },
  { value: "specification", label: "规格说明" },
  { value: "other", label: "其他" },
] as const;

type FileRole = (typeof FILE_ROLE_OPTIONS)[number]["value"];

function DesignVersionEditInner() {
  const params = useLocalSearchParams<{ projectId: string; designVersionId?: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const initialProjectId = Number(params.projectId);
  const initialVersionId = params.designVersionId ? Number(params.designVersionId) : undefined;
  const [projectId] = useState(initialProjectId);
  const [designVersionId, setDesignVersionId] = useState<number | undefined>(initialVersionId);
  const requestIds = useRef(new StableProjectRequestIds()).current;
  const accessTracker = useRef(new ControlledAccessTracker()).current;
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [fileRole, setFileRole] = useState<FileRole>("source");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [disableTargetId, setDisableTargetId] = useState<number | null>(null);

  const projectDetail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const detail = trpc.designVersions.detail.useQuery(
    { designVersionId: designVersionId ?? 0 },
    { enabled: Boolean(designVersionId), retry: 1 },
  );

  useEffect(() => {
    if (!detail.data || hydrated) return;
    setTitle(detail.data.version.title ?? "");
    setSummary(detail.data.version.summary ?? "");
    setChangeNotes(detail.data.version.changeNotes ?? "");
    setHydrated(true);
  }, [detail.data, hydrated]);

  useEffect(() => {
    return () => {
      void accessTracker.cleanup();
    };
  }, [accessTracker]);

  const invalidate = async (targetId?: number) => {
    await Promise.all([
      utils.designVersions.list.invalidate({ projectId }),
      utils.projects.detail.invalidate({ id: projectId }),
      targetId ? utils.designVersions.detail.invalidate({ designVersionId: targetId }) : Promise.resolve(),
    ]);
  };

  const createMutation = trpc.designVersions.createDraft.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const updateMutation = trpc.designVersions.updateDraft.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const submitMutation = trpc.designVersions.submit.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const uploadMutation = trpc.designVersions.uploadFile.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const disableFileMutation = trpc.designVersions.disableFile.useMutation({
    onError: (cause) => setError(projectDesignPrototypeErrorMessage(cause)),
  });
  const fileAccess = trpc.designVersions.fileAccess.useMutation();

  const capabilityCodes = projectDetail.data?.myCapabilityCodes ?? [];
  const canCreate = capabilityCodes.includes("project.design_version.create");
  const canEdit = capabilityCodes.includes("project.design_version.edit");
  const canUpload = capabilityCodes.includes("project.design_file.upload");
  const canSubmit = capabilityCodes.includes("project.design_version.submit");

  const ensureDraft = async () => {
    if (designVersionId) return designVersionId;
    const operationKey = `design-create:${projectId}`;
    const created = await createMutation.mutateAsync({
      projectId,
      title: title.trim(),
      summary: summary.trim(),
      changeNotes: changeNotes.trim() || undefined,
      requestId: requestIds.get(operationKey),
    });
    requestIds.complete(operationKey);
    setDesignVersionId(created.id);
    setHydrated(false);
    await invalidate(created.id);
    router.replace(`/projects/design-version-edit?projectId=${projectId}&designVersionId=${created.id}` as never);
    return created.id;
  };

  const saveDraft = async () => {
    try {
      setError("");
      if (!title.trim() || !summary.trim()) {
        setError("请先填写标题和摘要。");
        return;
      }
      if (!canCreate && !designVersionId) {
        setError("当前没有创建设计版本的权限。");
        return;
      }
      if (!canEdit && designVersionId) {
        setError("当前没有编辑设计版本的权限。");
        return;
      }
      if (!designVersionId) {
        await ensureDraft();
        return;
      }
      const operationKey = `design-update:${designVersionId}`;
      await updateMutation.mutateAsync({
        designVersionId,
        title: title.trim(),
        summary: summary.trim(),
        changeNotes: changeNotes.trim() || undefined,
        expectedAuthorizationVersion: detail.data?.version.authorizationVersion,
        requestId: requestIds.get(operationKey),
      });
      requestIds.complete(operationKey);
      await invalidate(designVersionId);
      void detail.refetch();
    } catch {
      // Error state handled by mutations.
    }
  };

  const submitDraft = async () => {
    try {
      setError("");
      if (!canSubmit) {
        setError("当前没有提交设计版本的权限。");
        return;
      }
      const targetId = await ensureDraft();
      const currentDetail = targetId === designVersionId ? detail.data : await utils.designVersions.detail.fetch({ designVersionId: targetId });
      if (!currentDetail?.files?.length) {
        setError("请先上传至少一个设计文件后再提交。");
        return;
      }
      const operationKey = `design-submit:${targetId}`;
      await submitMutation.mutateAsync({
        designVersionId: targetId,
        expectedAuthorizationVersion: currentDetail.version.authorizationVersion,
        requestId: requestIds.get(operationKey),
      });
      requestIds.complete(operationKey);
      await invalidate(targetId);
      router.replace(`/projects/design-version/${targetId}` as never);
    } catch {
      // Error state handled by mutations.
    }
  };

  const pickAndUpload = async () => {
    try {
      setError("");
      if (!canUpload) {
        setError("当前没有上传设计文件的权限。");
        return;
      }
      const targetId = await ensureDraft();
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if ((asset.size ?? 0) > 8 * 1024 * 1024) {
        setError("单个文件不能超过8MB。");
        return;
      }
      const operationKey = `design-upload:${targetId}:${asset.name}`;
      await uploadMutation.mutateAsync({
        designVersionId: targetId,
        fileName: asset.name,
        mimeType: asset.mimeType ?? undefined,
        base64Data: await readLocalFileBase64(asset.uri),
        fileRole,
        requestId: requestIds.get(operationKey),
      });
      requestIds.complete(operationKey);
      await invalidate(targetId);
      void detail.refetch();
    } catch (cause) {
      setError(projectDesignPrototypeErrorMessage(cause));
    }
  };

  if (projectDetail.isLoading || (designVersionId && detail.isLoading && !hydrated)) return <LoadingView />;
  if (projectDetail.isError || detail.isError) {
    return (
      <ErrorState
        title="设计草稿加载失败"
        hint={projectDesignPrototypeErrorMessage(projectDetail.error ?? detail.error)}
        onRetry={() => {
          void projectDetail.refetch();
          void detail.refetch();
        }}
      />
    );
  }
  if (!projectDetail.data) return <EmptyState title="项目不存在或无权访问" />;

  const status = detail.data ? (DESIGN_VERSION_STATUS_LABELS[detail.data.version.status] ?? { label: detail.data.version.status, tone: "gray" as const }) : null;
  const editable = !detail.data || detail.data.version.status === "draft";

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg font-bold text-foreground">{designVersionId ? "编辑设计草稿" : "创建设计草稿"}</Text>
            <Text className="text-sm text-muted mt-1 leading-5">
              保存草稿后即可继续上传设计文件，提交后版本转为只读。
            </Text>
          </View>
          {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
        </View>
        {detail.data ? (
          <View className="mt-3">
            <InfoRow label="版本号" value={`V${detail.data.version.versionNo}`} />
            <InfoRow label="创建时间" value={formatTime(detail.data.version.createdAt)} />
          </View>
        ) : null}
      </View>

      {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}

      {!editable ? (
        <View className="mt-4">
          <EmptyState
            title="当前版本已不可编辑"
            hint="已提交、已替代或已撤回的设计版本都只读，请返回列表创建新版本。"
            actionTitle="返回版本列表"
            onAction={() => router.replace(`/projects/design-versions/${projectId}` as never)}
          />
        </View>
      ) : (
        <>
          <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
            <FieldLabel label="标题" required />
            <AppTextInput value={title} onChangeText={setTitle} placeholder="例如：工业设计初稿 V1" />
            <FieldLabel label="摘要" required />
            <AppTextInput value={summary} onChangeText={setSummary} placeholder="概述本次设计目标、适用场景和交付范围" multiline />
            <FieldLabel label="变更说明" />
            <AppTextInput value={changeNotes} onChangeText={setChangeNotes} placeholder="记录本版本相较历史版本的主要变化" multiline />
            <View className="flex-row gap-2 mt-4">
              <View className="flex-1">
                <PrimaryButton
                  title="保存草稿"
                  variant="outline"
                  onPress={() => { void saveDraft(); }}
                  loading={createMutation.isPending || updateMutation.isPending}
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  title="提交版本"
                  onPress={() => { void submitDraft(); }}
                  loading={submitMutation.isPending}
                  disabled={!canSubmit}
                />
              </View>
            </View>
          </View>

          <View className="bg-surface rounded-2xl border border-border p-4 mt-4">
            <Text className="text-base font-semibold text-foreground">设计文件</Text>
            <Text className="text-xs text-muted mt-1 leading-4">
              通过短期受控链接打开文件，不展示永久地址或内部存储信息。
            </Text>
            <FieldLabel label="文件角色" />
            <ChipSelector options={[...FILE_ROLE_OPTIONS]} value={fileRole} onChange={(value) => setFileRole(value)} />
            <View className="mt-3">
              <PrimaryButton
                title={designVersionId ? "选择并上传文件" : "先保存草稿再上传"}
                onPress={() => { void pickAndUpload(); }}
                loading={uploadMutation.isPending}
                disabled={!canUpload}
              />
            </View>
            {!designVersionId ? (
              <Text className="text-xs text-muted mt-2">设计文件会绑定到当前草稿版本，首次上传前会先自动创建草稿。</Text>
            ) : null}
          </View>
        </>
      )}

      <View className="mt-4">
        <Text className="text-base font-semibold text-foreground mb-3">已绑定文件</Text>
        {!detail.data ? (
          <EmptyState title="草稿尚未创建" hint="先保存草稿，再上传源文件、预览图、规格说明等设计资料。" />
        ) : detail.data.files.length === 0 ? (
          <EmptyState title="暂无设计文件" hint="上传成功后，文件会立即绑定到当前设计版本。" />
        ) : (
          detail.data.files.map((file) => (
            <View key={file.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-foreground flex-1" numberOfLines={1}>{file.fileName}</Text>
                <StatusBadge label={file.status === "disabled" ? "已停用" : (DESIGN_FILE_ROLE_LABELS[file.fileRole] ?? file.fileRole)} tone={file.status === "disabled" ? "gray" : "teal"} small />
              </View>
              <Text className="text-xs text-muted mt-1">
                {file.mimeType ?? "未知类型"} · {(file.sizeBytes / 1024).toFixed(1)} KB · {formatTime(file.createdAt)}
              </Text>
              <View className="flex-row gap-2 mt-3">
                {file.status !== "disabled" ? (
                  <View className="flex-1">
                    <PrimaryButton
                      title="受控打开"
                      variant="outline"
                      small
                      loading={fileAccess.isPending}
                      onPress={async () => {
                        try {
                          setError("");
                          const access = await fileAccess.mutateAsync({ designVersionFileId: file.id, purpose: "preview" });
                          await accessTracker.openPath(access.path);
                        } catch (cause) {
                          setError(projectDesignPrototypeErrorMessage(cause));
                        }
                      }}
                    />
                  </View>
                ) : null}
                {file.status !== "disabled" && canEdit ? (
                  <View className="flex-1">
                    <PrimaryButton title="停用文件" variant="danger" small onPress={() => setDisableTargetId(file.id)} />
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <ConfirmDialog
        visible={disableTargetId !== null}
        title="停用设计文件"
        message="停用后旧访问路径会立即失效，已撤回或停用文件不会继续展示。"
        confirmText="确认停用"
        danger
        loading={disableFileMutation.isPending}
        onCancel={() => setDisableTargetId(null)}
        onConfirm={async () => {
          if (!disableTargetId) return;
          const operationKey = `design-disable:${disableTargetId}`;
          await disableFileMutation.mutateAsync({
            designVersionFileId: disableTargetId,
            requestId: requestIds.get(operationKey),
          });
          requestIds.complete(operationKey);
          setDisableTargetId(null);
          if (designVersionId) {
            await invalidate(designVersionId);
            void detail.refetch();
          }
        }}
      />
    </ScrollView>
  );
}

export default function DesignVersionEditScreen() {
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <PageHeader title="设计草稿" />
      <AuthGate title="登录后编辑设计草稿">
        <DesignVersionEditInner />
      </AuthGate>
    </ScreenContainer>
  );
}
