import { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { AuthGate, PageHeader } from "@/components/auth-gate";
import { AppTextInput, ChipSelector, EmptyState, FieldLabel, LoadingView, PrimaryButton, StatusBadge } from "@/components/common";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { formatTime } from "@/lib/labels";
import { getApiBaseUrl } from "@/constants/app";

const CATEGORY_OPTIONS = [
  { value: "requirement", label: "需求" },
  { value: "design", label: "设计" },
  { value: "delivery", label: "交付" },
  { value: "test", label: "测试" },
  { value: "agreement", label: "协议" },
  { value: "other", label: "其他" },
] as const;
type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

async function readBase64(uri: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function ProjectFilesInner() {
  const { projectId: rawId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(rawId);
  const detail = trpc.projects.detail.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) });
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<Category>("delivery");
  const [description, setDescription] = useState("");
  const [formalSubmission, setFormalSubmission] = useState(true);
  const [targetMilestoneId, setTargetMilestoneId] = useState<number | undefined>();
  const [versionGroupId, setVersionGroupId] = useState<string | undefined>();
  const [error, setError] = useState("");

  const upload = trpc.projects.uploadFile.useMutation({
    onSuccess: () => {
      setDescription("");
      setVersionGroupId(undefined);
      setError("");
      utils.projects.detail.invalidate({ id: projectId });
    },
    onError: (e) => setError(e.message),
  });
  const disable = trpc.projects.disableFile.useMutation({
    onSuccess: () => utils.projects.detail.invalidate({ id: projectId }),
    onError: (e) => setError(e.message),
  });

  if (detail.isLoading) return <LoadingView />;
  if (!detail.data) return <EmptyState title="项目不存在或无权查看" />;
  const { files, milestones } = detail.data;

  const pickAndUpload = async () => {
    try {
      setError("");
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 8 * 1024 * 1024) {
        setError("单个文件不能超过8MB");
        return;
      }
      const base64Data = await readBase64(asset.uri);
      upload.mutate({
        projectId,
        milestoneId: targetMilestoneId,
        fileGroupId: versionGroupId,
        fileName: asset.name,
        mimeType: asset.mimeType ?? undefined,
        base64Data,
        category,
        description: description.trim() || undefined,
        formalSubmission,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取文件失败");
    }
  };

  const openFile = async (fileId: number) => {
    try {
      setError("");
      const access = await utils.client.projects.fileAccessUrl.query({ fileId });
      await Linking.openURL(`${getApiBaseUrl()}${access.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法打开文件");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
      <View className="bg-surface rounded-2xl border border-border p-4">
        <Text className="text-base font-semibold text-foreground">上传项目文件</Text>
        <Text className="text-xs text-muted mt-1 leading-4">支持设计图、文档、源码压缩包、测试报告等，单文件不超过8MB。</Text>
        <FieldLabel label="文件分类" />
        <ChipSelector options={[...CATEGORY_OPTIONS]} value={category} onChange={setCategory} />
        <FieldLabel label="所属里程碑" />
        <ChipSelector
          options={[{ value: "none", label: "不指定" }, ...milestones.map((m) => ({ value: String(m.id), label: m.title }))]}
          value={targetMilestoneId ? String(targetMilestoneId) : "none"}
          onChange={(v) => setTargetMilestoneId(v === "none" ? undefined : Number(v))}
        />
        <FieldLabel label="文件说明" />
        <AppTextInput value={description} onChangeText={setDescription} placeholder="说明文件用途、主要变更或验收方法" multiline />
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1"><PrimaryButton title={formalSubmission ? "正式交付：是" : "正式交付：否"} variant="outline" small onPress={() => setFormalSubmission((v) => !v)} /></View>
          <View className="flex-1"><PrimaryButton title={versionGroupId ? "上传新版本" : "选择文件上传"} onPress={pickAndUpload} loading={upload.isPending} /></View>
        </View>
        {versionGroupId ? <Text className="text-xs text-primary mt-2">当前将作为同一文件的新版本上传。</Text> : null}
        {error ? <Text className="text-sm text-error mt-3">{error}</Text> : null}
      </View>

      <View className="mt-4">
        <Text className="text-base font-semibold text-foreground mb-3">项目文件 {files.length}</Text>
        {files.length === 0 ? <EmptyState title="暂无项目文件" hint="上传后的文件会按版本保留，正式交付文件不可直接删除。" /> : files.map((file) => (
          <View key={file.id} className="bg-surface rounded-2xl border border-border p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground flex-1" numberOfLines={1}>{file.fileName}</Text>
              <StatusBadge label={file.status === "available" ? `V${file.versionNo}` : file.status === "superseded" ? `V${file.versionNo} 已替代` : "已停用"} tone={file.status === "available" ? "green" : "gray"} small />
            </View>
            <Text className="text-xs text-muted mt-1">{file.category} · {(file.sizeBytes / 1024).toFixed(1)} KB · {formatTime(file.createdAt)}</Text>
            {file.description ? <Text className="text-sm text-foreground mt-2 leading-5">{file.description}</Text> : null}
            {file.formalSubmission ? <Text className="text-xs text-action mt-2">正式交付文件</Text> : null}
            <View className="flex-row gap-2 mt-3">
              <View className="flex-1"><PrimaryButton title="打开文件" variant="outline" small onPress={() => openFile(file.id)} /></View>
              {file.status === "available" ? <View className="flex-1"><PrimaryButton title="上传新版本" variant="muted" small onPress={() => { setVersionGroupId(file.fileGroupId); setCategory(file.category); setTargetMilestoneId(file.milestoneId ?? undefined); }} /></View> : null}
              {file.status === "available" && !file.formalSubmission && file.uploadedBy === user?.id ? <View className="flex-1"><PrimaryButton title="停用" variant="danger" small onPress={() => disable.mutate({ fileId: file.id })} /></View> : null}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function ProjectFilesScreen() {
  return <ScreenContainer edges={["top", "left", "right", "bottom"]}><PageHeader title="项目文件中心" /><AuthGate title="登录后查看项目文件"><ProjectFilesInner /></AuthGate></ScreenContainer>;
}
