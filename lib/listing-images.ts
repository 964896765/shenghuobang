import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { getApiBaseUrl } from "@/constants/app";
import * as Auth from "@/lib/_core/auth";
import { fetchWithTimeout } from "@/lib/_core/network";
import {
  LISTING_IMAGE_MIME_TYPES,
  MAX_LISTING_IMAGE_BYTES,
  MAX_LISTING_IMAGES,
  validateListingImage,
} from "@/lib/listing-image-policy";

export { LISTING_IMAGE_MIME_TYPES, MAX_LISTING_IMAGE_BYTES, MAX_LISTING_IMAGES, validateListingImage };

export type ListingImageDraft = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  fileId?: number;
};

export function listingImageFileId(value: string) {
  const match = /^file:(\d+)$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

export function listingImageUrl(value: string) {
  const fileId = listingImageFileId(value);
  return fileId ? `${getApiBaseUrl()}/api/files/${fileId}/public` : value;
}

export function existingListingImages(values: string[] | null | undefined): ListingImageDraft[] {
  return (values ?? []).map((value, index) => {
    const fileId = listingImageFileId(value);
    return {
      key: fileId ? `file-${fileId}` : `legacy-${index}-${value}`,
      uri: listingImageUrl(value),
      name: fileId ? `image-${fileId}` : `image-${index + 1}`,
      mimeType: "image/jpeg",
      size: 0,
      fileId,
    };
  });
}

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

export async function uploadListingImage(listingId: number, image: ListingImageDraft) {
  if (image.fileId) return image.fileId;
  const token = await Auth.getSessionToken();
  const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({
      fileName: image.name,
      mimeType: image.mimeType,
      base64: await readBase64(image.uri),
      privacyLevel: "public",
      relatedEntityType: "listing",
      relatedEntityId: listingId,
    }),
  }, 60_000);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && Number.isSafeInteger(payload?.existingFileId)) return Number(payload.existingFileId);
  if (!response.ok || !Number.isSafeInteger(payload?.id)) {
    throw new Error(payload?.error || "图片上传失败，请稍后重试");
  }
  return Number(payload.id);
}

export async function uploadReviewImage(image: ListingImageDraft) {
  if (image.fileId) return image.fileId;
  const token = await Auth.getSessionToken();
  const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({
      fileName: image.name,
      mimeType: image.mimeType,
      base64: await readBase64(image.uri),
      privacyLevel: "public",
    }),
  }, 60_000);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && Number.isSafeInteger(payload?.existingFileId)) return Number(payload.existingFileId);
  if (!response.ok || !Number.isSafeInteger(payload?.id)) throw new Error(payload?.error || "评价图片上传失败，请稍后重试");
  return Number(payload.id);
}
