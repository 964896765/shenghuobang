import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getApiBaseUrl } from "@/constants/app";
import * as Auth from "@/lib/_core/auth";
import { fetchWithTimeout } from "@/lib/_core/network";
import type { IdeaInvitationStatus } from "@/lib/idea-app-contract";

export {
  IDEA_REASON_MESSAGES,
  StableIdeaRequestIds,
  canRespondToInvitation,
  effectiveInvitationStatus,
  ideaErrorMessage,
  mergeIdeaPages,
} from "@/lib/idea-app-contract";
export type { IdeaInvitationStatus } from "@/lib/idea-app-contract";

export type IdeaVisibility = "public" | "private" | "nda";
export type IdeaStatus = "draft" | "published" | "collaborating" | "converted" | "archived";
export type IdeaAttachmentType = "cover" | "reference" | "design" | "other";
export type IdeaConfidentiality = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "NDA" | "RESTRICTED";

export interface IdeaListItem {
  id: number;
  title?: string | null;
  summary?: string | null;
  categoryCode?: string | null;
  tags?: string[] | null;
  visibility?: IdeaVisibility | null;
  status?: IdeaStatus | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  authorizationVersion?: number | null;
  convertedProjectId?: number | null;
}

export function asIdeaListItems(value: readonly Partial<Record<string, unknown>>[]): IdeaListItem[] {
  return value.filter((item) => Number.isSafeInteger(item.id) && Number(item.id) > 0) as unknown as IdeaListItem[];
}

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  draft: "草稿",
  published: "已发布",
  collaborating: "协作中",
  converted: "已转项目",
  archived: "已归档",
};

export const IDEA_VISIBILITY_LABELS: Record<IdeaVisibility, string> = {
  public: "公开",
  private: "私密",
  nda: "保密协议",
};

export const IDEA_INVITATION_LABELS: Record<IdeaInvitationStatus, string> = {
  pending: "待处理",
  accepted: "已接受",
  declined: "已拒绝",
  revoked: "已撤销",
  expired: "已过期",
};

async function readBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function uploadIdeaStoredFile(input: {
  uri: string;
  name: string;
  mimeType: string;
  requestId: string;
}): Promise<number> {
  const token = await Auth.getSessionToken();
  const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": input.requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({
      fileName: input.name,
      mimeType: input.mimeType,
      base64: await readBase64(input.uri),
      privacyLevel: "high_sensitive",
    }),
  }, 60_000);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && Number.isSafeInteger(payload?.existingFileId)) return Number(payload.existingFileId);
  if (!response.ok || !Number.isSafeInteger(payload?.id)) throw new Error(payload?.error || "文件上传失败");
  return Number(payload.id);
}

export async function openIdeaAttachmentAccessPath(path: string): Promise<void> {
  if (!path.startsWith("/api/idea-files/") || !path.includes("/content?")) {
    throw new Error("RESOURCE_RELATION_REQUIRED");
  }
  const token = await Auth.getSessionToken();
  const url = `${getApiBaseUrl()}${path}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  if (Platform.OS === "web") {
    const response = await fetchWithTimeout(url, { credentials: "include", headers }, 30_000);
    if (!response.ok) throw new Error(response.status === 403 ? "FORBIDDEN" : "RESOURCE_RELATION_REQUIRED");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  }
  const destination = `${FileSystem.cacheDirectory}idea-attachment-${Date.now()}`;
  const downloaded = await FileSystem.downloadAsync(url, destination, { headers });
  if (downloaded.status !== 200) throw new Error(downloaded.status === 403 ? "FORBIDDEN" : "RESOURCE_RELATION_REQUIRED");
  const openUri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(downloaded.uri) : downloaded.uri;
  await Linking.openURL(openUri);
}
