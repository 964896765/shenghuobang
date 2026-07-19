import crypto from "node:crypto";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createVerificationFileAccessPath } from "../_core/verificationFileAccess";
import { storagePut } from "../storage";
import * as verification from "../services/verification-service";
import { writeAudit } from "../services/audit-service";
import * as db from "../db";
import { DevelopmentFileScanner } from "../storage/scanner";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "../storage/file-policy";
import { authorizeOrThrow, getAuthorizationService, serializeAuthorized } from "../authorization";

const verificationFileScanner = new DevelopmentFileScanner();

const verificationType = z.enum(["identity", "engineer", "merchant"]);

export const verificationsRouter = router({
  mine: protectedProcedure.query(({ ctx }) => verification.myVerifications(ctx.user.id)),
  submitIdentity: protectedProcedure.input(z.object({
    realName: z.string().trim().min(2).max(64), idType: z.string().max(32).default("cn_id"), idNumber: z.string().trim().min(6).max(64),
  })).mutation(async ({ ctx, input }) => ({ id: await verification.submitIdentity(ctx.user.id, input) })),
  submitEngineer: protectedProcedure.input(z.object({
    realName: z.string().trim().min(2).max(64), professionalTitle: z.string().trim().min(2).max(128),
    primaryCategory: z.string().trim().min(2).max(64), yearsOfExperience: z.number().int().min(0).max(60),
    introduction: z.string().max(2000).optional(), skills: z.array(z.string().max(64)).max(30),
    startingPrice: z.number().int().min(0).optional(), supportsRemote: z.boolean().optional(), supportsOnsite: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => ({ id: await verification.submitEngineer(ctx.user.id, input) })),
  submitMerchant: protectedProcedure.input(z.object({
    merchantName: z.string().trim().min(2).max(128), registrationNo: z.string().trim().min(6).max(64).optional(),
    categories: z.array(z.string().max(64)).min(1).max(20), description: z.string().max(2000).optional(), addressText: z.string().max(255).optional(),
  })).mutation(async ({ ctx, input }) => ({ id: await verification.submitMerchant(ctx.user.id, input) })),
  uploadDocument: protectedProcedure.input(z.object({
    verificationType, verificationId: z.number().int().positive(), documentType: z.string().trim().min(2).max(64),
    fileName: z.string().trim().min(1).max(255), mimeType: z.string().max(128).optional(), base64Data: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const payload = input.base64Data.includes(",") ? input.base64Data.split(",").pop() ?? "" : input.base64Data;
    const buffer = Buffer.from(payload, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) throw new Error("证明文件大小必须在 1B 到 8MB 之间");
    if (await db.countStoredFiles(ctx.user.id, "verification", input.verificationId) >= 20) throw new Error("认证资料数量已达上限");
    const safeName = sanitizeFileName(input.fileName);
    const detected = detectFile(buffer);
    const mimeType = input.mimeType ?? detected.mimeType;
    validateMimeAndExtension(safeName, mimeType, detected);
    const scan = await verificationFileScanner.scan(buffer, safeName, detected.mimeType);
    if (scan.status === "rejected") throw new Error(scan.reason ?? "文件安全检查未通过");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    if (await db.findStoredFileByOwnerAndHash(ctx.user.id, sha256)) throw new Error("相同文件已上传");
    const stored = await storagePut(`verifications/${ctx.user.id}/${crypto.randomUUID()}-${safeName}`, buffer, mimeType);
    const storedFileId = await db.createStoredFile({ ownerId: ctx.user.id, provider: stored.provider, storageKey: stored.key, originalName: safeName, mimeType, sizeBytes: buffer.byteLength, sha256, privacyLevel: "high_sensitive", virusScanStatus: scan.status, status: "available", relatedEntityType: "verification", relatedEntityId: input.verificationId });
    await db.addFileAccessLog({ fileId: storedFileId, userId: ctx.user.id, action: "upload", relatedEntityType: "verification", relatedEntityId: input.verificationId, result: "success" });
    const id = await verification.addVerificationDocument({
      verificationType: input.verificationType, verificationId: input.verificationId, ownerId: ctx.user.id,
      documentType: input.documentType, fileName: safeName, storageKey: stored.key,
      mimeType, sizeBytes: buffer.byteLength,
    });
    return { id };
  }),
  documentAccess: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const document = await verification.getVerificationDocument(input.documentId);
    if (!document || document.ownerId !== ctx.user.id) throw new Error("无权查看该证明文件");
    const stored = await db.getStoredFileByKey(document.storageKey);
    if (!stored || stored.status !== "available") throw new Error("证明文件不可用");
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "file.access", resourceType: "stored_file", resourceId: String(stored.id), expectedResourceVersion: stored.accessPolicyVersion, purpose: "issue_own_verification_document_link" });
    return { path: createVerificationFileAccessPath(document.id, ctx.user.id, stored.accessPolicyVersion), expiresInSeconds: 60 };
  }),
});

export const adminVerificationsRouter = router({
  pending: protectedProcedure.query(async ({ ctx }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.certification.queue_read", view: "list", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const result = await verification.listPendingVerifications();
    const service = getAuthorizationService();
    const resolved = await Promise.all(result.items.map(async ({ type, item }) => ({
      type,
      item,
      decision: await service.authorize({
        accountId: ctx.user.id, capabilityCode: "platform.certification.queue_read", platformStaffPositionId: authorization.resolvedPlatformStaffPositionId,
        resourceType: `verification:${type}`, resourceId: String(item.id), view: "list", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null,
      }),
    })));
    return { ...result, items: resolved.filter(({ decision }) => decision.allowed).map(({ type, item, decision }) => ({ type, item: serializeAuthorized(item, decision) })) };
  }),
  detail: protectedProcedure.input(z.object({ type: verificationType, id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "platform.certification.queue_read", resourceType: `verification:${input.type}`, resourceId: String(input.id), view: "detail",
      requestedFields: ["idNumberDigest", "idNumberLast4", "registrationNoDigest", "registrationNoLast4", "addressText"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null,
    });
    const detail = await verification.verificationDetail(input.type, input.id);
    return {
      ...detail,
      record: serializeAuthorized(detail.record, authorization),
      documents: detail.documents.map((document) => serializeAuthorized(document, authorization)),
    };
  }),
  documentAccess: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const document = await verification.getVerificationDocument(input.documentId);
    if (!document) throw new Error("证明文件不存在");
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "platform.certification.document_read", resourceType: `verification:${document.verificationType}`, resourceId: String(document.verificationId),
      requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "issue_verification_document_link",
    });
    const stored = await db.getStoredFileByKey(document.storageKey);
    if (!stored || stored.status !== "available") throw new Error("证明文件不可用");
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "verification.document.link", resourceType: "verification_document", resourceId: document.id, riskLevel: "sensitive", ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    return { path: createVerificationFileAccessPath(document.id, ctx.user.id, stored.accessPolicyVersion), expiresInSeconds: 60 };
  }),
  review: protectedProcedure.input(z.object({
    type: verificationType, id: z.number().int().positive(), action: z.enum(["approve", "request_info", "reject"]), reason: z.string().max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: input.action === "request_info" ? "platform.certification.review_initial" : "platform.certification.review_final",
      resourceType: `verification:${input.type}`, resourceId: String(input.id), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null,
      purpose: `verification_${input.action}`,
    });
    const result = await verification.reviewVerification(input.type, input.id, ctx.user.id, input.action, input.reason);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: `verification.${input.action}`, resourceType: `${input.type}_verification`, resourceId: input.id, riskLevel: "sensitive", detail: { reason: input.reason }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    await db.createNotification({ userId: result.userId, category: "system", title: input.action === "approve" ? "认证审核通过" : input.action === "request_info" ? "认证需要补充资料" : "认证未通过", content: input.reason ?? "审核已完成", refType: "verification", refId: input.id });
    return result;
  }),
  revoke: protectedProcedure.input(z.object({
    type: verificationType, id: z.number().int().positive(), reason: z.string().trim().min(2).max(500), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "platform.certification.revoke", resourceType: `verification:${input.type}`, resourceId: String(input.id),
      requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "revoke_verification",
    });
    if (input.confirmation !== `CONFIRM:verification:${input.type}:${input.id}`) throw new Error("高风险操作二次确认无效");
    const userId = await verification.revokeVerification(input.type, input.id, ctx.user.id, input.reason);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "verification.revoke", resourceType: `${input.type}_verification`, resourceId: input.id, riskLevel: "high", detail: { reason: input.reason, targetUserId: userId }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    await db.createNotification({ userId, category: "system", title: "认证已撤销", content: input.reason, refType: "verification", refId: input.id });
    return { success: true };
  }),
});
