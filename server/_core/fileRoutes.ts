import type { Express, Request } from "express";
import crypto from "node:crypto";
import { sdk } from "./sdk";
import * as db from "../db";
import { getStorageProvider } from "../storage/registry";
import { DevelopmentFileScanner } from "../storage/scanner";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "../storage/file-policy";
import { signFileAccess, verifyFileAccess, type FileAccessClaims } from "../storage/file-access-token";
import { ENV } from "./env";
import { logger } from "./logger";
import { authorizeOrThrow } from "../authorization";

const scanner = new DevelopmentFileScanner();
const privacyLevels = new Set(["public", "business", "sensitive", "high_sensitive"]);
const relatedTypes = new Set(["item", "listing"]);
function clientIp(req: Request) { return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(); }
function base64Buffer(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) throw new Error("文件编码无效");
  return Buffer.from(compact, "base64");
}
function canRead(file: Awaited<ReturnType<typeof db.getStoredFile>>, userId: number) {
  return Boolean(file && (file.ownerId === userId || file.privacyLevel === "public"));
}
async function logAccess(req: Request, data: Parameters<typeof db.addFileAccessLog>[0]) {
  try { await db.addFileAccessLog({ ...data, ipAddress: clientIp(req), deviceId: req.headers["x-device-id"] as string | undefined }); }
  catch (error) { logger.warn("file.access_log_failed", { fileId: data.fileId, userId: data.userId, error }); }
}

export function registerFileRoutes(app: Express) {
  app.post("/api/files/upload", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      await authorizeOrThrow(user.id, {
        capabilityCode: "file.access", purpose: "upload_file", requestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      });
      const { fileName, mimeType, base64, privacyLevel = "business", relatedEntityType, relatedEntityId } = req.body ?? {};
      if (typeof fileName !== "string" || typeof mimeType !== "string" || typeof base64 !== "string") return res.status(400).json({ error: "文件参数不完整" });
      if (!privacyLevels.has(privacyLevel) || (relatedEntityType && !relatedTypes.has(relatedEntityType)) || (relatedEntityType && !Number.isSafeInteger(relatedEntityId))) return res.status(400).json({ error: "文件用途参数无效" });
      if (!(await db.canManageRelatedFile(user.id, user.role, relatedEntityType, relatedEntityId))) return res.status(403).json({ error: "无权向该业务对象上传文件" });
      if (await db.countStoredFiles(user.id, relatedEntityType, relatedEntityId) >= ENV.maxFilesPerEntity) return res.status(409).json({ error: "该业务对象文件数量已达上限" });
      const safeName = sanitizeFileName(fileName);
      const body = base64Buffer(base64);
      if (!body.length || body.length > ENV.maxUploadBytes) return res.status(400).json({ error: "文件为空或超过大小限制" });
      const detected = detectFile(body);
      const extension = validateMimeAndExtension(safeName, mimeType.toLowerCase(), detected);
      const scan = await scanner.scan(body, safeName, detected.mimeType);
      if (scan.status === "rejected") return res.status(400).json({ error: scan.reason });
      const sha256 = crypto.createHash("sha256").update(body).digest("hex");
      const duplicate = await db.findStoredFileByOwnerAndHash(user.id, sha256);
      if (duplicate) return res.status(409).json({ error: "相同文件已上传", existingFileId: duplicate.id });
      const key = `files/${user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
      const provider = getStorageProvider();
      await provider.put({ key, body, contentType: mimeType });
      const id = await db.createStoredFile({ ownerId: user.id, provider: provider.name, storageKey: key, originalName: safeName, mimeType, sizeBytes: body.length, sha256, privacyLevel, virusScanStatus: scan.status, status: "available", relatedEntityType, relatedEntityId });
      await logAccess(req, { fileId: id, userId: user.id, action: "upload", relatedEntityType, relatedEntityId, result: "success" });
      res.status(201).json({ id, sha256, virusScanStatus: scan.status, warning: scan.status === "unavailable" ? scan.reason : undefined });
    } catch (error) {
      logger.warn("file.upload_rejected", { error });
      res.status(400).json({ error: error instanceof Error ? error.message : "上传失败" });
    }
  });

  // Marketplace images are intentionally public. They still pass the existing
  // file signature, MIME/header, size and development scanner checks on upload.
  app.get("/api/files/:id/public", async (req, res) => {
    try {
      const file = await db.getStoredFile(Number(req.params.id));
      if (
        !file ||
        file.status !== "available" ||
        file.privacyLevel !== "public" ||
        !file.mimeType.startsWith("image/") ||
        ["pending", "rejected"].includes(file.virusScanStatus)
      ) {
        return res.status(404).json({ error: "图片不存在或不可用" });
      }
      const body = await getStorageProvider().read(file.storageKey);
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(body);
    } catch (error) {
      logger.warn("file.public_image_failed", { fileId: req.params.id, error });
      return res.status(404).json({ error: "图片读取失败" });
    }
  });

  app.get("/api/files/:id/access", async (req, res) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | undefined;
    let file: Awaited<ReturnType<typeof db.getStoredFile>>;
    try {
      user = await sdk.authenticateRequest(req);
      await authorizeOrThrow(user.id, {
        capabilityCode: "file.access", resourceType: "stored_file", resourceId: String(req.params.id), purpose: "issue_file_access",
        requestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      });
      file = await db.getStoredFile(Number(req.params.id));
      if (!file || file.status !== "available") return res.status(404).json({ error: "文件不存在" });
      if (!canRead(file, user.id)) {
        await logAccess(req, { fileId: file.id, userId: user.id, action: "download", relatedEntityType: file.relatedEntityType, relatedEntityId: file.relatedEntityId, result: "denied", reason: "permission_denied" });
        return res.status(403).json({ error: "无权访问文件" });
      }
      if (["rejected", "pending"].includes(file.virusScanStatus)) return res.status(403).json({ error: "文件安全检查未通过" });
      const purpose = req.query.purpose === "preview" ? "preview" : "download";
      const expiresIn = file.privacyLevel === "high_sensitive" ? 60 : 300;
      const claims: FileAccessClaims = { fileId: file.id, userId: user.id, expires: Math.floor(Date.now() / 1000) + expiresIn, purpose, nonce: crypto.randomUUID(), version: String(file.accessPolicyVersion) };
      const signature = signFileAccess(claims);
      const query = new URLSearchParams({ userId: String(claims.userId), expires: String(claims.expires), purpose, nonce: claims.nonce, version: claims.version, signature });
      res.json({ url: `/api/files/${file.id}/content?${query}`, expiresIn });
    } catch (error) {
      logger.warn("file.access_link_rejected", { userId: user?.id, fileId: req.params.id, error });
      res.status(401).json({ error: "访问认证失败" });
    }
  });

  app.get("/api/files/:id/content", async (req, res) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | undefined;
    const fileId = Number(req.params.id);
    try {
      user = await sdk.authenticateRequest(req);
      const claims: FileAccessClaims = { fileId, userId: Number(req.query.userId), expires: Number(req.query.expires), purpose: req.query.purpose === "preview" ? "preview" : "download", nonce: String(req.query.nonce ?? ""), version: String(req.query.version ?? "") };
      const signature = String(req.query.signature ?? "");
      const file = await db.getStoredFile(fileId);
      await authorizeOrThrow(user.id, {
        capabilityCode: "file.access", resourceType: "stored_file", resourceId: String(fileId), purpose: claims.purpose,
        expectedResourceVersion: file?.accessPolicyVersion, requestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      });
      const authorized = user.id === claims.userId && verifyFileAccess(claims, signature) && file && String(file.accessPolicyVersion) === claims.version && file.status === "available" && !["rejected", "pending"].includes(file.virusScanStatus) && canRead(file, user.id);
      if (!file) return res.status(404).json({ error: "文件不存在" });
      if (!authorized) {
        await logAccess(req, { fileId, userId: user.id, action: claims.purpose, relatedEntityType: file.relatedEntityType, relatedEntityId: file.relatedEntityId, result: "denied", reason: "token_or_permission_invalid" });
        return res.status(403).json({ error: "链接已过期、无效或权限已变化" });
      }
      const body = await getStorageProvider().read(file.storageKey);
      await logAccess(req, { fileId, userId: user.id, action: claims.purpose, relatedEntityType: file.relatedEntityType, relatedEntityId: file.relatedEntityId, result: "success" });
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `${claims.purpose === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(body);
    } catch (error) {
      logger.warn("file.download_failed", { userId: user?.id, fileId, error });
      res.status(user ? 404 : 401).json({ error: user ? "文件读取失败" : "访问认证失败" });
    }
  });
}
