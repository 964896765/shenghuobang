import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, PutObjectInput } from "./provider";
import { ENV } from "../_core/env";

function safeKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
}
function filePath(key: string) { return path.resolve(ENV.uploadDir, safeKey(key)); }
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;
  async put(input: PutObjectInput) { const p=filePath(input.key); await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, input.body); }
  async read(key: string) { return readFile(filePath(key)); }
  async signedReadUrl(_key: string, _expiresSeconds: number): Promise<string> { throw new Error("Use the authorized file access route to create signed links"); }
  async exists(key: string) { try { await access(filePath(key)); return true; } catch { return false; } }
  async checkReady() { try { await mkdir(path.resolve(ENV.uploadDir), { recursive: true }); await access(path.resolve(ENV.uploadDir)); return true; } catch { return false; } }
}
