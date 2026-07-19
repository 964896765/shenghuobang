import crypto from "node:crypto";
import type { Express, Request } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { fileAccessLogs, ideaAttachments, ideas, storedFiles } from "../../drizzle/schema";
import { authorizeOrThrow } from "../authorization";
import { requireDb } from "../db";
import { storageRead } from "../storage";
import {
  signIdeaFileAccess,
  verifyIdeaFileAccess,
  type IdeaFileAccessClaims,
  type IdeaFileAccessPurpose,
} from "../storage/idea-file-access-token";
import { logger } from "./logger";
import { sdk } from "./sdk";

function clientIp(req: Request): string {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
}

function requestIdFromHeader(req: Request): string | null {
  const value = req.headers["x-request-id"];
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : null;
}

function claimsQuery(claims: IdeaFileAccessClaims): URLSearchParams {
  return new URLSearchParams({
    accountId: String(claims.accountId),
    ideaId: String(claims.ideaId),
    fileId: String(claims.fileId),
    purpose: claims.purpose,
    ideaAuthorizationVersion: String(claims.ideaAuthorizationVersion),
    attachmentPolicyVersion: String(claims.attachmentPolicyVersion),
    storedFilePolicyVersion: String(claims.storedFilePolicyVersion),
    expires: String(claims.expires),
    nonce: claims.nonce,
    requestId: claims.requestId,
    signature: signIdeaFileAccess(claims),
  });
}

function parseClaims(req: Request, attachmentId: number): IdeaFileAccessClaims {
  return {
    accountId: Number(req.query.accountId),
    ideaId: Number(req.query.ideaId),
    attachmentId,
    fileId: Number(req.query.fileId),
    purpose: String(req.query.purpose) as IdeaFileAccessPurpose,
    ideaAuthorizationVersion: Number(req.query.ideaAuthorizationVersion),
    attachmentPolicyVersion: Number(req.query.attachmentPolicyVersion),
    storedFilePolicyVersion: Number(req.query.storedFilePolicyVersion),
    expires: Number(req.query.expires),
    nonce: String(req.query.nonce ?? ""),
    requestId: String(req.query.requestId ?? ""),
  };
}

async function attachmentSnapshot(attachmentId: number) {
  const db = await requireDb();
  const [row] = await db.select({
    attachmentId: ideaAttachments.id,
    ideaId: ideaAttachments.ideaId,
    fileId: ideaAttachments.fileId,
    attachmentPolicyVersion: ideaAttachments.accessPolicyVersion,
    attachmentDisabledAt: ideaAttachments.disabledAt,
    confidentialityLevel: ideaAttachments.confidentialityLevel,
    ideaStatus: ideas.status,
    ideaAuthorizationVersion: ideas.authorizationVersion,
    ideaDeletedAt: ideas.deletedAt,
    storedFileStatus: storedFiles.status,
    virusScanStatus: storedFiles.virusScanStatus,
    storedFilePolicyVersion: storedFiles.accessPolicyVersion,
    storageKey: storedFiles.storageKey,
    originalName: storedFiles.originalName,
    mimeType: storedFiles.mimeType,
  }).from(ideaAttachments)
    .innerJoin(ideas, eq(ideas.id, ideaAttachments.ideaId))
    .innerJoin(storedFiles, eq(storedFiles.id, ideaAttachments.fileId))
    .where(and(eq(ideaAttachments.id, attachmentId), isNull(ideas.deletedAt)))
    .limit(1);
  return row ?? null;
}

function snapshotAvailable(snapshot: Awaited<ReturnType<typeof attachmentSnapshot>>): snapshot is NonNullable<typeof snapshot> {
  return Boolean(snapshot && !snapshot.attachmentDisabledAt && snapshot.ideaStatus !== "archived" &&
    snapshot.storedFileStatus === "available" && snapshot.virusScanStatus === "clean");
}

export async function createIdeaAttachmentAccessPath(input: {
  attachmentId: number;
  accountId: number;
  purpose: IdeaFileAccessPurpose;
  requestId: string;
  ttlSeconds?: number;
}): Promise<{ path: string; expiresAt: string; policyVersion: string }> {
  const snapshot = await attachmentSnapshot(input.attachmentId);
  if (!snapshotAvailable(snapshot)) throw new TRPCError({ code: "FORBIDDEN", message: "RESOURCE_RELATION_REQUIRED" });
  await authorizeOrThrow(input.accountId, {
    capabilityCode: "idea.attachment.download",
    resourceType: "idea_attachment",
    resourceId: String(input.attachmentId),
    purpose: `idea_attachment_${input.purpose}`,
    requestId: input.requestId,
    expectedResourceVersion: snapshot.attachmentPolicyVersion,
    view: "detail",
  });
  const expires = Math.floor(Date.now() / 1000) + Math.min(300, Math.max(10, input.ttlSeconds ?? 60));
  const claims: IdeaFileAccessClaims = {
    accountId: input.accountId,
    ideaId: snapshot.ideaId,
    attachmentId: snapshot.attachmentId,
    fileId: snapshot.fileId,
    purpose: input.purpose,
    ideaAuthorizationVersion: snapshot.ideaAuthorizationVersion,
    attachmentPolicyVersion: snapshot.attachmentPolicyVersion,
    storedFilePolicyVersion: snapshot.storedFilePolicyVersion,
    expires,
    nonce: crypto.randomUUID(),
    requestId: input.requestId,
  };
  const path = `/api/idea-files/${snapshot.attachmentId}/content?${claimsQuery(claims).toString()}`;
  return { path, expiresAt: new Date(expires * 1000).toISOString(), policyVersion: `${snapshot.ideaAuthorizationVersion}.${snapshot.attachmentPolicyVersion}.${snapshot.storedFilePolicyVersion}` };
}

export function registerIdeaFileAccess(app: Express): void {
  app.get("/api/idea-files/:attachmentId/content", async (req, res) => {
    let accountId: number | null = null;
    try {
      const user = await sdk.authenticateRequest(req);
      accountId = user.id;
      const attachmentId = Number(req.params.attachmentId);
      if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) return void res.status(404).json({ error: "Resource not found" });
      const claims = parseClaims(req, attachmentId);
      const signature = String(req.query.signature ?? "");
      const snapshot = await attachmentSnapshot(attachmentId);
      if (!snapshotAvailable(snapshot)) return void res.status(404).json({ error: "Resource not found" });
      await authorizeOrThrow(user.id, {
        capabilityCode: "idea.attachment.download",
        resourceType: "idea_attachment",
        resourceId: String(attachmentId),
        purpose: `idea_attachment_${claims.purpose}`,
        requestId: requestIdFromHeader(req) ?? claims.requestId,
        expectedResourceVersion: snapshot.attachmentPolicyVersion,
        view: "detail",
      });
      const versionsMatch = claims.accountId === user.id && claims.ideaId === snapshot.ideaId &&
        claims.attachmentId === snapshot.attachmentId && claims.fileId === snapshot.fileId &&
        claims.ideaAuthorizationVersion === snapshot.ideaAuthorizationVersion &&
        claims.attachmentPolicyVersion === snapshot.attachmentPolicyVersion &&
        claims.storedFilePolicyVersion === snapshot.storedFilePolicyVersion;
      if (!versionsMatch || !verifyIdeaFileAccess(claims, signature)) {
        await (await requireDb()).insert(fileAccessLogs).values({
          fileId: snapshot.fileId, userId: user.id, action: claims.purpose === "preview" ? "preview" : "download",
          relatedEntityType: "idea", relatedEntityId: snapshot.ideaId, ipAddress: clientIp(req),
          deviceId: typeof req.headers["x-device-id"] === "string" ? req.headers["x-device-id"] : undefined,
          result: "denied", reason: "token_or_policy_version_invalid",
        });
        return void res.status(404).json({ error: "Resource not found" });
      }
      const data = await storageRead(snapshot.storageKey);
      await (await requireDb()).insert(fileAccessLogs).values({
        fileId: snapshot.fileId, userId: user.id, action: claims.purpose === "preview" ? "preview" : "download",
        relatedEntityType: "idea", relatedEntityId: snapshot.ideaId, ipAddress: clientIp(req),
        deviceId: typeof req.headers["x-device-id"] === "string" ? req.headers["x-device-id"] : undefined,
        result: "success",
      });
      res.setHeader("Content-Type", snapshot.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `${claims.purpose === "preview" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(snapshot.originalName)}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error) {
      logger.warn("idea_file.access_denied", { accountId, attachmentIdDigest: crypto.createHash("sha256").update(String(req.params.attachmentId)).digest("hex").slice(0, 16), reasonCode: error instanceof Error ? error.message : "ACCESS_DENIED" });
      res.status(accountId == null ? 401 : 404).json({ error: accountId == null ? "Authentication required" : "Resource not found" });
    }
  });
}
