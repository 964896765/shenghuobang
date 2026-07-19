import crypto from "node:crypto";
import type { Express, Request } from "express";
import * as db from "../db";
import { storageRead } from "../storage";
import { sdk } from "./sdk";
import { signFileAccess, verifyFileAccess, type FileAccessClaims } from "../storage/file-access-token";
import { logger } from "./logger";
import { authorizeOrThrow } from "../authorization";

function versionFor(fileId: number, accessPolicyVersion: number) { return crypto.createHash("sha256").update(`project:${fileId}:policy:${accessPolicyVersion}`).digest("hex").slice(0, 16); }
function clientIp(req: Request) { return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(); }

export function createProjectFileAccessPath(fileId: number, userId: number, accessPolicyVersion: number, ttlSeconds = 60) {
  const claims: FileAccessClaims = { fileId, userId, expires: Math.floor(Date.now() / 1000) + ttlSeconds, purpose: "download", nonce: crypto.randomUUID(), version: versionFor(fileId, accessPolicyVersion) };
  const query = new URLSearchParams({ userId: String(userId), expires: String(claims.expires), purpose: claims.purpose, nonce: claims.nonce, version: claims.version, signature: signFileAccess(claims) });
  return `/api/project-files/${fileId}?${query}`;
}

export function registerProjectFileAccess(app: Express) {
  app.get("/api/project-files/:id", async (req, res) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | undefined;
    try {
      user = await sdk.authenticateRequest(req);
      const fileId = Number(req.params.id);
      const claims: FileAccessClaims = { fileId, userId: Number(req.query.userId), expires: Number(req.query.expires), purpose: "download", nonce: String(req.query.nonce ?? ""), version: String(req.query.version ?? "") };
      const [file, signature] = [await db.getProjectFile(fileId), String(req.query.signature ?? "")];
      if (!file || file.status === "disabled") return void res.status(404).json({ error: "File not found" });
      await authorizeOrThrow(user.id, {
        capabilityCode: "project.file.download", projectId: file.projectId, resourceType: "project_file", resourceId: String(file.id),
        expectedResourceVersion: file.accessPolicyVersion, purpose: "download_project_file",
        requestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
      });
      const storedFile = await db.getStoredFileByKey(file.storageKey);
      const allowed = user.id === claims.userId && verifyFileAccess(claims, signature) && claims.version === versionFor(file.id, file.accessPolicyVersion) && storedFile?.status === "available" && !["rejected", "pending"].includes(storedFile.virusScanStatus);
      if (!allowed) {
        if (storedFile) await db.addFileAccessLog({ fileId: storedFile.id, userId: user.id, action: "download", relatedEntityType: "project", relatedEntityId: file.projectId, ipAddress: clientIp(req), deviceId: req.headers["x-device-id"] as string | undefined, result: "denied", reason: "token_or_permission_invalid" });
        return void res.status(403).json({ error: "File access denied" });
      }
      const data = await storageRead(file.storageKey);
      await db.addFileAccessLog({ fileId: storedFile.id, userId: user.id, action: "download", relatedEntityType: "project", relatedEntityId: file.projectId, ipAddress: clientIp(req), deviceId: req.headers["x-device-id"] as string | undefined, result: "success" });
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error) {
      logger.warn("project_file.download_failed", { userId: user?.id, fileId: req.params.id, error });
      res.status(user ? 500 : 401).json({ error: user ? "Unable to read file" : "Authentication required" });
    }
  });
}
