import crypto from "node:crypto";
import path from "node:path";
import { getStorageProvider } from "./storage/registry";

function normalizeKey(relKey: string): string {
  const normalized = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
}
function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ext = path.extname(relKey);
  return ext ? `${relKey.slice(0, -ext.length)}_${hash}${ext}` : `${relKey}_${hash}`;
}
export async function storagePut(relKey: string, data: Buffer | Uint8Array | string, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const provider = getStorageProvider();
  await provider.put({ key, body, contentType });
  return { key, provider: provider.name };
}
export async function storageRead(relKey: string): Promise<Buffer> { return getStorageProvider().read(normalizeKey(relKey)); }
