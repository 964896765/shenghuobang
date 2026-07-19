import crypto from "node:crypto";
import type { Express } from "express";
import { getStoredFileByKey, addFileAccessLog } from "../db";
import { getVerificationDocument } from "../services/verification-service";
import { storageRead } from "../storage";
import { writeAudit } from "../services/audit-service";
import { sdk } from "./sdk";
import { signFileAccess, verifyFileAccess, type FileAccessClaims } from "../storage/file-access-token";
import { logger } from "./logger";
import { authorizeOrThrow } from "../authorization";

function versionFor(documentId: number, accessPolicyVersion: number) { return crypto.createHash("sha256").update(`verification:${documentId}:policy:${accessPolicyVersion}`).digest("hex").slice(0, 16); }

export function createVerificationFileAccessPath(documentId: number, viewerId: number, accessPolicyVersion: number, ttlSeconds = 60) {
  const claims: FileAccessClaims = { fileId: documentId, userId: viewerId, expires: Math.floor(Date.now() / 1000) + ttlSeconds, purpose: "download", nonce: crypto.randomUUID(), version: versionFor(documentId, accessPolicyVersion) };
  const query = new URLSearchParams({ viewerId: String(viewerId), expires: String(claims.expires), purpose: claims.purpose, nonce: claims.nonce, version: claims.version, signature: signFileAccess(claims) });
  return `/api/verification-documents/${documentId}?${query}`;
}

export function registerVerificationFileAccess(app: Express) {
  app.get("/api/verification-documents/:id", async (req, res) => {
    let authenticatedUserId: number | undefined;
    try {
      const authenticated = await sdk.authenticateRequest(req);
      authenticatedUserId = authenticated.id;
      const documentId = Number(req.params.id);
      const claims: FileAccessClaims = { fileId: documentId, userId: Number(req.query.viewerId), expires: Number(req.query.expires), purpose: "download", nonce: String(req.query.nonce ?? ""), version: String(req.query.version ?? "") };
      const document = await getVerificationDocument(documentId);
      if (!document || document.status !== "available") return void res.status(404).json({ error: "File not found" });
      const stored = await getStoredFileByKey(document.storageKey);
      if (!stored) return void res.status(404).json({ error: "File not found" });
      if (document.ownerId === authenticated.id) {
        await authorizeOrThrow(authenticated.id, { capabilityCode: "file.access", resourceType: "stored_file", resourceId: String(stored.id), expectedResourceVersion: stored.accessPolicyVersion, purpose: "download_own_verification_document" });
      } else {
        await authorizeOrThrow(authenticated.id, { capabilityCode: "platform.certification.document_read", resourceType: `verification:${document.verificationType}`, resourceId: String(document.verificationId), purpose: "download_verification_document" });
      }
      const allowed = authenticated.id === claims.userId && verifyFileAccess(claims, String(req.query.signature ?? "")) && claims.version === versionFor(document.id, stored.accessPolicyVersion) && stored.status === "available" && !["rejected", "pending"].includes(stored.virusScanStatus);
      if (!allowed) {
        if (stored) await addFileAccessLog({ fileId: stored.id, userId: authenticated.id, action: "download", relatedEntityType: "verification", relatedEntityId: document.verificationId, ipAddress: req.ip, result: "denied", reason: "token_or_permission_invalid" });
        return void res.status(403).json({ error: "File access denied" });
      }
      if (document.ownerId !== authenticated.id) await writeAudit({ actorId: authenticated.id, actorRole: authenticated.role, action: "verification.document.read", resourceType: "verification_document", resourceId: document.id, riskLevel: "sensitive", ipAddress: req.ip, userAgent: req.get("user-agent") });
      const data = await storageRead(document.storageKey);
      await addFileAccessLog({ fileId: stored.id, userId: authenticated.id, action: "download", relatedEntityType: "verification", relatedEntityId: document.verificationId, ipAddress: req.ip, result: "success" });
      res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
      res.setHeader("X-Document-Watermark", crypto.createHash("sha256").update(`viewer:${authenticated.id}|document:${document.id}|nonce:${claims.nonce}`).digest("hex").slice(0, 24));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error) {
      logger.warn("verification_file.download_failed", { userId: authenticatedUserId, documentId: req.params.id, error });
      res.status(authenticatedUserId ? 500 : 401).json({ error: authenticatedUserId ? "Unable to read verification file" : "Authentication required" });
    }
  });
}
