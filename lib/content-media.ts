import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { getApiBaseUrl } from "@/constants/app";
import * as Auth from "@/lib/_core/auth";
import { fetchWithTimeout } from "@/lib/_core/network";

export type ContentMediaDraft = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  fileId?: number;
};

async function readBase64(uri: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export function contentMediaUrl(fileId: number) {
  return `${getApiBaseUrl()}/api/files/${fileId}/public`;
}

export async function uploadContentMedia(postId: number, media: ContentMediaDraft) {
  if (media.fileId) return media.fileId;
  if (media.size > 8 * 1024 * 1024) throw new Error("单个媒体文件不能超过 8MB");
  const token = await Auth.getSessionToken();
  const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/files/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
    body: JSON.stringify({
      fileName: media.name,
      mimeType: media.mimeType,
      base64: await readBase64(media.uri),
      privacyLevel: "public",
      relatedEntityType: "content_post",
      relatedEntityId: postId,
    }),
  }, 60_000);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && Number.isSafeInteger(payload?.existingFileId)) return Number(payload.existingFileId);
  if (!response.ok || !Number.isSafeInteger(payload?.id)) throw new Error(payload?.error || "媒体上传失败，请稍后重试");
  return Number(payload.id);
}
