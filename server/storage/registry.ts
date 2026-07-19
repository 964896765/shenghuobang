import type { StorageProvider } from "./provider";
import { LocalStorageProvider } from "./local-provider";
import { S3CompatibleStorageProvider } from "./s3-provider";
import { ENV } from "../_core/env";
let provider: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  if (!provider) provider = ENV.storageProvider === "s3" ? new S3CompatibleStorageProvider() : new LocalStorageProvider();
  return provider;
}
