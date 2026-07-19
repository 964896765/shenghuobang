import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { z } from "zod";
import { authorizeOrThrow, serializeAuthorized } from "../authorization";
import { protectedProcedure, router } from "../_core/trpc";
import {
  ensureBusinessIdentity,
  attachCertificationDocument,
  getMyIdentity,
  listMyCertifications,
  listMyCertificationDocuments,
  listMyIdentities,
  submitIdentityCertification,
  suspendMyIdentity,
  updateAccountAndPublicProfile,
  updateMyIdentityProfile,
} from "../services/identity-service";
import * as db from "../db";
import { storagePut } from "../storage";
import { DevelopmentFileScanner } from "../storage/scanner";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "../storage/file-policy";
import {
  assignOrganizationPosition,
  changeOrganizationMemberStatus,
  createOrganization,
  createOrganizationPosition,
  getOrganization,
  inviteOrganizationMember,
  listMyOrganizations,
  listOrganizationMembers,
  listOrganizationPositions,
  respondToOrganizationInvitation,
  revokeOrganizationPosition,
  updateOrganization,
} from "../services/organization-service";
import { listAvailableWorkspaces, switchWorkspace } from "../services/workspace-service";

function requestId(headers: Record<string, unknown>): string | null {
  const value = headers["x-request-id"];
  return typeof value === "string" && value.length <= 64 ? value : null;
}

const certificationFileScanner = new DevelopmentFileScanner();

function asTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : "RESOURCE_STATE_FORBIDDEN";
  const conflictCodes = new Set(["CONCURRENT_MODIFICATION", "RESOURCE_STATE_FORBIDDEN", "LAST_OWNER_CANNOT_LEAVE"]);
  const goneCodes = new Set(["INVITATION_EXPIRED"]);
  throw new TRPCError({
    code: goneCodes.has(message) ? "BAD_REQUEST" : conflictCodes.has(message) ? "CONFLICT" : "FORBIDDEN",
    message,
  });
}

const identityProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  professionalTitle: z.string().trim().max(128).optional(),
  introduction: z.string().trim().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
  cityCode: z.string().trim().max(32).optional(),
  cityName: z.string().trim().max(64).optional(),
  profileData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
});

export const identityRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.list_self", purpose: "identity_list_mine", requestId: requestId(ctx.req.headers) });
    return listMyIdentities(ctx.user.id);
  }),
  create: protectedProcedure.input(z.object({ type: z.enum(["consumer", "engineer", "merchant"]), profile: identityProfileSchema.optional() })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.create", purpose: "identity_create", requestId: requestId(ctx.req.headers) });
    try { return await ensureBusinessIdentity(ctx.user.id, input.type, input.profile); } catch (error) { return asTrpcError(error); }
  }),
  updateProfile: protectedProcedure.input(z.object({ identityId: z.number().int().positive(), profile: identityProfileSchema })).mutation(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "identity.profile.update_self", identityId: input.identityId,
      resourceType: "identity", resourceId: String(input.identityId), purpose: "identity_profile_update", requestId: requestId(ctx.req.headers),
    });
    try {
      await updateMyIdentityProfile(ctx.user.id, input.identityId, input.profile);
      const identity = await getMyIdentity(ctx.user.id, input.identityId);
      return identity ? serializeAuthorized(identity as Record<string, unknown>, authorization) : null;
    } catch (error) { return asTrpcError(error); }
  }),
  suspend: protectedProcedure.input(z.object({ identityId: z.number().int().positive(), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "identity.suspend", identityId: input.identityId,
      resourceType: "identity", resourceId: String(input.identityId), purpose: "identity_suspend", requestId: requestId(ctx.req.headers),
    });
    try { return await suspendMyIdentity(ctx.user.id, input.identityId, input.reason); } catch (error) { return asTrpcError(error); }
  }),
});

export const certificationRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.view_self", purpose: "certification_list_mine", requestId: requestId(ctx.req.headers), view: "list" });
    return listMyCertifications(ctx.user.id);
  }),
  submitIdentity: protectedProcedure.input(z.object({
    realName: z.string().trim().min(2).max(64),
    idType: z.string().trim().min(2).max(32),
    idNumber: z.string().trim().min(6).max(128),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", purpose: "real_name_certification_submit", requestId: requestId(ctx.req.headers) });
    try {
      return await submitIdentityCertification(ctx.user.id, {
        identityKind: "consumer", certificationKind: "real_name", requestId: requestId(ctx.req.headers),
        profile: {}, application: input,
      });
    } catch (error) { return asTrpcError(error); }
  }),
  submitEngineer: protectedProcedure.input(z.object({
    realName: z.string().trim().min(1).max(64),
    displayName: z.string().trim().min(1).max(128).optional(),
    professionalTitle: z.string().trim().min(1).max(128),
    primaryCategory: z.string().trim().min(1).max(64),
    yearsOfExperience: z.number().int().min(0).max(60),
    introduction: z.string().trim().max(2000).optional(),
    skills: z.array(z.string().trim().min(1).max(64)).max(30),
    startingPrice: z.number().int().min(0).optional(),
    supportsRemote: z.boolean().optional(),
    supportsOnsite: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", purpose: "engineer_certification_submit", requestId: requestId(ctx.req.headers) });
    try {
      return await submitIdentityCertification(ctx.user.id, {
        identityKind: "engineer", certificationKind: "engineer_basic", requestId: requestId(ctx.req.headers),
        profile: {
          displayName: input.displayName, professionalTitle: input.professionalTitle, introduction: input.introduction,
          skills: input.skills, profileData: { primaryCategory: input.primaryCategory, yearsOfExperience: input.yearsOfExperience, startingPrice: input.startingPrice ?? 0, supportsRemote: input.supportsRemote ?? true, supportsOnsite: input.supportsOnsite ?? false },
        },
        application: { realName: input.realName, professionalTitle: input.professionalTitle, primaryCategory: input.primaryCategory, yearsOfExperience: input.yearsOfExperience, introduction: input.introduction, skills: input.skills },
      });
    } catch (error) { return asTrpcError(error); }
  }),
  submitMerchant: protectedProcedure.input(z.object({
    merchantName: z.string().trim().min(1).max(128),
    registrationNo: z.string().trim().min(4).max(128).optional(),
    categories: z.array(z.string().trim().min(1).max(64)).max(20),
    description: z.string().trim().max(2000).optional(),
    addressText: z.string().trim().max(255).optional(),
    contactName: z.string().trim().max(64).optional(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", purpose: "merchant_certification_submit", requestId: requestId(ctx.req.headers) });
    try {
      return await submitIdentityCertification(ctx.user.id, {
        identityKind: "merchant", certificationKind: "merchant_business_license", requestId: requestId(ctx.req.headers),
        profile: { displayName: input.merchantName, introduction: input.description, profileData: { categories: input.categories } },
        application: input,
      });
    } catch (error) { return asTrpcError(error); }
  }),
  uploadDocument: protectedProcedure.input(z.object({
    certificationId: z.number().int().positive(),
    documentType: z.string().trim().min(2).max(64),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().max(128).optional(),
    base64Data: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.submit_self", resourceType: "certification", resourceId: String(input.certificationId), purpose: "certification_document_attach", requestId: requestId(ctx.req.headers) });
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "file.access", purpose: "upload_file", requestId: requestId(ctx.req.headers) });
    const payload = input.base64Data.includes(",") ? input.base64Data.split(",").pop() ?? "" : input.base64Data;
    const buffer = Buffer.from(payload, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_SIZE_INVALID" });
    if (await db.countStoredFiles(ctx.user.id, "certification", input.certificationId) >= 20) throw new TRPCError({ code: "CONFLICT", message: "FILE_LIMIT_REACHED" });
    const safeName = sanitizeFileName(input.fileName);
    const detected = detectFile(buffer);
    const mimeType = input.mimeType ?? detected.mimeType;
    validateMimeAndExtension(safeName, mimeType, detected);
    const scan = await certificationFileScanner.scan(buffer, safeName, detected.mimeType);
    if (scan.status === "rejected") throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_SCAN_REJECTED" });
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (await db.findStoredFileByOwnerAndHash(ctx.user.id, checksum)) throw new TRPCError({ code: "CONFLICT", message: "FILE_DUPLICATE" });
    const stored = await storagePut(`certifications/${ctx.user.id}/${crypto.randomUUID()}-${safeName}`, buffer, mimeType);
    const fileId = await db.createStoredFile({ ownerId: ctx.user.id, provider: stored.provider, storageKey: stored.key, originalName: safeName, mimeType, sizeBytes: buffer.byteLength, sha256: checksum, privacyLevel: "high_sensitive", virusScanStatus: scan.status, status: "available", relatedEntityType: "certification", relatedEntityId: input.certificationId });
    await db.addFileAccessLog({ fileId, userId: ctx.user.id, action: "upload", relatedEntityType: "certification", relatedEntityId: input.certificationId, result: "success" });
    try { return await attachCertificationDocument(ctx.user.id, input.certificationId, fileId, input.documentType); } catch (error) { return asTrpcError(error); }
  }),
  documents: protectedProcedure.input(z.object({ certificationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.view_self", resourceType: "certification", resourceId: String(input.certificationId), purpose: "certification_documents_list", requestId: requestId(ctx.req.headers), view: "list" });
    return listMyCertificationDocuments(ctx.user.id, input.certificationId);
  }),
  documentAccess: protectedProcedure.input(z.object({ certificationId: z.number().int().positive(), fileId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "certification.view_self", resourceType: "certification", resourceId: String(input.certificationId), purpose: "certification_document_access", requestId: requestId(ctx.req.headers) });
    const documents = await listMyCertificationDocuments(ctx.user.id, input.certificationId);
    if (!documents.some((item) => item.fileId === input.fileId && item.status === "available")) throw new TRPCError({ code: "FORBIDDEN", message: "RESOURCE_RELATION_REQUIRED" });
    const file = await db.getStoredFile(input.fileId);
    if (!file || file.status !== "available") throw new TRPCError({ code: "NOT_FOUND", message: "RESOURCE_STATE_FORBIDDEN" });
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "file.access", resourceType: "stored_file", resourceId: String(file.id), expectedResourceVersion: file.accessPolicyVersion, purpose: "issue_certification_document_link", requestId: requestId(ctx.req.headers) });
    return { fileId: file.id, accessPath: `/api/files/${file.id}/access`, expiresInSeconds: 60 };
  }),
});

export const accountProfileRouter = router({
  update: protectedProcedure.input(z.object({
    accountName: z.string().trim().min(1).max(64).optional(),
    nickname: z.string().trim().min(1).max(64).optional(),
    bio: z.string().trim().max(500).optional(),
    cityName: z.string().trim().max(64).optional(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "account.profile.update_self", purpose: "account_profile_update", requestId: requestId(ctx.req.headers) });
    await updateAccountAndPublicProfile(ctx.user.id, input);
    return { success: true, compatibilityMirror: ["profile.nickname", "profile.bio", "profile.cityName"] };
  }),
});

const organizationContext = (ctx: { user: { id: number }; req: { headers: Record<string, unknown> } }, organizationId: number, capabilityCode: string, purpose: string, expectedResourceVersion?: number) => authorizeOrThrow(ctx.user.id, {
  capabilityCode, organizationId, resourceType: "organization", resourceId: String(organizationId),
  purpose, requestId: requestId(ctx.req.headers), expectedResourceVersion,
});

export const organizationRouter = router({
  create: protectedProcedure.input(z.object({
    name: z.string().trim().min(2).max(128), organizationType: z.string().trim().min(2).max(64),
    registrationCountry: z.string().length(2).optional(), description: z.string().trim().max(2000).optional(),
    cityCode: z.string().trim().max(32).optional(), cityName: z.string().trim().max(64).optional(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "organization.create", purpose: "organization_create", requestId: requestId(ctx.req.headers) });
    try { return await createOrganization(ctx.user.id, { ...input, requestId: requestId(ctx.req.headers) }); } catch (error) { return asTrpcError(error); }
  }),
  listMine: protectedProcedure.query(async ({ ctx }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.list_self", purpose: "organization_list_mine", requestId: requestId(ctx.req.headers), view: "list" });
    return listMyOrganizations(ctx.user.id);
  }),
  get: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const authorization = await organizationContext(ctx, input.organizationId, "organization.view", "organization_get");
    const record = await getOrganization(input.organizationId);
    return record ? serializeAuthorized(record as Record<string, unknown>, authorization) : null;
  }),
  update: protectedProcedure.input(z.object({
    organizationId: z.number().int().positive(), expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(2).max(128).optional(), description: z.string().trim().max(2000).optional(),
    cityCode: z.string().trim().max(32).optional(), cityName: z.string().trim().max(64).optional(),
  })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.update", "organization_update", input.expectedVersion);
    try { return await updateOrganization(ctx.user.id, input.organizationId, { ...input, requestId: requestId(ctx.req.headers) }); } catch (error) { return asTrpcError(error); }
  }),
  members: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.list", "organization_member_list");
    return listOrganizationMembers(input.organizationId);
  }),
  positions: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.list", "organization_position_list");
    return listOrganizationPositions(input.organizationId);
  }),
  createPosition: protectedProcedure.input(z.object({
    organizationId: z.number().int().positive(), code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
    name: z.string().trim().min(1).max(128), description: z.string().trim().max(500).optional(),
    capabilityCodes: z.array(z.string().trim().min(3).max(128)).max(30),
  })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.position.manage", "organization_position_create");
    try { return await createOrganizationPosition(ctx.user.id, input.organizationId, { ...input, requestId: requestId(ctx.req.headers) }); } catch (error) { return asTrpcError(error); }
  }),
  invite: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), inviteeAccountId: z.number().int().positive(), expiresInHours: z.number().int().min(1).max(24 * 30).default(168) })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.invite", "organization_member_invite");
    try { return await inviteOrganizationMember(ctx.user.id, input.organizationId, input.inviteeAccountId, input.expiresInHours, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
  respondInvitation: protectedProcedure.input(z.object({ token: z.string().min(32).max(256), action: z.enum(["accept", "decline"]) })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "organization.invitation.accept", purpose: `organization_invitation_${input.action}`, requestId: requestId(ctx.req.headers) });
    try { return await respondToOrganizationInvitation(ctx.user.id, input.token, input.action, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
  changeMemberStatus: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), membershipId: z.number().int().positive(), action: z.enum(["suspend", "restore", "remove"]), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const capability = input.action === "suspend" ? "organization.member.suspend" : input.action === "restore" ? "organization.member.restore" : "organization.member.remove";
    await organizationContext(ctx, input.organizationId, capability, `organization_member_${input.action}`);
    try { return await changeOrganizationMemberStatus(ctx.user.id, input.organizationId, input.membershipId, input.action, input.reason, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
  leave: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), membershipId: z.number().int().positive(), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.leave", "organization_member_leave");
    try { return await changeOrganizationMemberStatus(ctx.user.id, input.organizationId, input.membershipId, "leave", input.reason, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
  assignPosition: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), membershipId: z.number().int().positive(), positionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.assign_position", "organization_position_assign");
    try { return await assignOrganizationPosition(ctx.user.id, input.organizationId, input.membershipId, input.positionId, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
  revokePosition: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), assignmentId: z.number().int().positive(), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    await organizationContext(ctx, input.organizationId, "organization.member.assign_position", "organization_position_revoke");
    try { return await revokeOrganizationPosition(ctx.user.id, input.organizationId, input.assignmentId, input.reason, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
});

export const workspaceRouter = router({
  listAvailable: protectedProcedure.query(async ({ ctx }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.list_self", purpose: "workspace_list_available", requestId: requestId(ctx.req.headers), view: "list" });
    return listAvailableWorkspaces(ctx.user.id);
  }),
  switch: protectedProcedure.input(z.discriminatedUnion("workspaceType", [
    z.object({ workspaceType: z.literal("personal") }),
    z.object({ workspaceType: z.literal("identity"), identityId: z.number().int().positive() }),
    z.object({ workspaceType: z.literal("organization"), organizationId: z.number().int().positive() }),
    z.object({ workspaceType: z.literal("platform"), platformStaffPositionId: z.number().int().positive() }),
  ])).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "identity.switch", purpose: "workspace_switch", requestId: requestId(ctx.req.headers) });
    try { return await switchWorkspace(ctx.user.id, input, requestId(ctx.req.headers)); } catch (error) { return asTrpcError(error); }
  }),
});
