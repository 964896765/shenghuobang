export const MAX_LISTING_IMAGES = 6;
export const MAX_LISTING_IMAGE_BYTES = 8 * 1024 * 1024;
export const LISTING_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export function validateListingImage(asset: { name?: string; mimeType?: string | null; size?: number | null }) {
  const mimeType = asset.mimeType?.toLowerCase() ?? "";
  if (!LISTING_IMAGE_MIME_TYPES.includes(mimeType as (typeof LISTING_IMAGE_MIME_TYPES)[number])) {
    return "仅支持 JPG、PNG、WebP 或 GIF 图片";
  }
  if (!asset.size) return "图片为空或无法读取";
  if (asset.size > MAX_LISTING_IMAGE_BYTES) return "单张图片不能超过 8MB";
  return null;
}
