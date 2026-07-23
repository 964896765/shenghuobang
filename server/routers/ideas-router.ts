import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createIdeaAttachmentAccessPath } from "../_core/ideaFileAccess";
import { IdeaService, IdeaServiceError } from "../services/idea-service";

const ideaService = new IdeaService();
const positiveId = z.number().int().positive();
const requestId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/);
const visibility = z.enum(["public", "private", "nda"]);
const requestedRole = z.enum(["designer", "engineer", "viewer"]);
const confidentiality = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]);
const limit = z.number().int().min(1).max(50).default(20);
const searchLimit = z.number().int().min(1).max(20).default(10);
const authorizationVersion = z.number().int().nonnegative();

const draftFields = {
  creatorIdentityId: positiveId,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(20_000),
  categoryCode: z.string().trim().min(1).max(64),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  visibility: visibility.optional(),
};

const publicCursor = z.object({
  publishedAt: z.string().datetime({ offset: true }),
  id: positiveId,
}).strict();

const safeReasonCodes = new Set([
  "ACCOUNT_INACTIVE", "IDENTITY_INACTIVE", "CERTIFICATION_INACTIVE", "CAPABILITY_MISSING", "DATA_SCOPE_MISMATCH",
  "RESOURCE_RELATION_REQUIRED", "RESOURCE_STATE_FORBIDDEN", "CONFIDENTIALITY_TOO_HIGH", "NDA_REQUIRED", "GRANT_INACTIVE",
  "CONCURRENT_MODIFICATION", "INVITATION_EXPIRED", "IDEMPOTENCY_CONFLICT", "CURSOR_INVALID", "PROJECT_ENGINEER_REQUIRED",
  "PROJECT_ROLE_INACTIVE", "IDEA_TITLE_INVALID", "IDEA_SUMMARY_INVALID", "IDEA_DESCRIPTION_INVALID", "IDEA_CATEGORY_INVALID",
  "SEARCH_QUERY_INVALID", "SEARCH_CURSOR_INVALID", "SEARCH_RATE_LIMITED", "INVITATION_TARGET_INVALID",
]);

export function ideaErrorToTrpc(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const candidate = error instanceof IdeaServiceError ? error.code : error instanceof Error ? error.message : "INTERNAL_ERROR";
  const reasonCode = safeReasonCodes.has(candidate) ? candidate : "INTERNAL_ERROR";
  if (reasonCode === "RESOURCE_RELATION_REQUIRED") throw new TRPCError({ code: "NOT_FOUND", message: reasonCode });
  if (reasonCode === "SEARCH_RATE_LIMITED") throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: reasonCode });
  if (["RESOURCE_STATE_FORBIDDEN", "INVITATION_EXPIRED", "CONCURRENT_MODIFICATION", "IDEMPOTENCY_CONFLICT"].includes(reasonCode)) {
    throw new TRPCError({ code: "CONFLICT", message: reasonCode });
  }
  if (reasonCode.endsWith("_INVALID") || reasonCode === "CURSOR_INVALID") throw new TRPCError({ code: "BAD_REQUEST", message: reasonCode });
  if (reasonCode === "INTERNAL_ERROR") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: reasonCode });
  throw new TRPCError({ code: "FORBIDDEN", message: reasonCode });
}

async function invoke<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { return ideaErrorToTrpc(error); }
}

export const ideasRouter = router({
  createDraft: protectedProcedure.input(z.object({ ...draftFields, requestId }).strict()).mutation(({ ctx, input }) => {
    const { requestId: operationId, ...draft } = input;
    return invoke(() => ideaService.createDraft(ctx.user.id, draft, operationId));
  }),

  updateDraft: protectedProcedure.input(z.object({
    ideaId: positiveId,
    title: draftFields.title.optional(),
    summary: draftFields.summary.optional(),
    description: draftFields.description.optional(),
    categoryCode: draftFields.categoryCode.optional(),
    tags: draftFields.tags,
    visibility: visibility.optional(),
    expectedAuthorizationVersion: authorizationVersion.optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => {
    const { ideaId, requestId: operationId, ...changes } = input;
    return invoke(() => ideaService.updateDraft(ctx.user.id, ideaId, changes, operationId));
  }),

  publish: protectedProcedure.input(z.object({ ideaId: positiveId, expectedAuthorizationVersion: authorizationVersion.optional(), requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.publish(ctx.user.id, input.ideaId, input.expectedAuthorizationVersion, input.requestId))),

  listPublic: protectedProcedure.input(z.object({ limit, cursor: publicCursor.optional() }).strict().optional())
    .query(({ ctx, input }) => invoke(() => ideaService.listPublic(ctx.user.id, input ?? {}))),

  listMine: protectedProcedure.input(z.object({ limit, cursor: positiveId.optional() }).strict().optional())
    .query(({ ctx, input }) => invoke(() => ideaService.listMine(ctx.user.id, input ?? {}))),

  searchCollaborators: protectedProcedure.input(z.object({
    ideaId: positiveId,
    query: z.string().trim().min(2).max(50),
    requestedRole,
    cityCode: z.string().trim().min(1).max(32).optional(),
    categoryCode: z.string().trim().min(1).max(64).optional(),
    limit: searchLimit.optional(),
    cursor: z.string().trim().min(16).max(512).optional(),
  }).strict()).query(({ ctx, input }) => invoke(() => ideaService.searchCollaborators(ctx.user.id, {
    ...input,
    requesterIp: ctx.req.ip,
    requesterUserAgent: ctx.req.get("user-agent"),
  }))),

  detail: protectedProcedure.input(z.object({ ideaId: positiveId }).strict())
    .query(({ ctx, input }) => invoke(() => ideaService.detail(ctx.user.id, input.ideaId))),

  archive: protectedProcedure.input(z.object({ ideaId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.archive(ctx.user.id, input.ideaId, input.requestId))),

  uploadAttachment: protectedProcedure.input(z.object({
    ideaId: positiveId,
    fileId: positiveId,
    attachmentType: z.enum(["cover", "reference", "design", "other"]),
    confidentialityLevel: confidentiality,
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => {
    const { ideaId, ...attachment } = input;
    return invoke(() => ideaService.uploadAttachment(ctx.user.id, ideaId, attachment));
  }),

  disableAttachment: protectedProcedure.input(z.object({ ideaId: positiveId, attachmentId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.disableAttachment(ctx.user.id, input.ideaId, input.attachmentId, input.requestId))),

  attachmentAccess: protectedProcedure.input(z.object({
    attachmentId: positiveId,
    purpose: z.enum(["download", "preview"]).default("download"),
    requestId,
  }).strict()).mutation(({ ctx, input }) => invoke(() => createIdeaAttachmentAccessPath({ ...input, accountId: ctx.user.id }))),

  inviteCollaborator: protectedProcedure.input(z.object({
    ideaId: positiveId,
    invitedAccountId: positiveId.optional(),
    invitedIdentityId: positiveId.optional(),
    invitationTargetToken: z.string().trim().min(16).max(2048).optional(),
    requestedRole,
    message: z.string().trim().max(1000).optional(),
    ndaRequired: z.boolean().optional(),
    expiresAt: z.coerce.date().refine((value) => value.getTime() > Date.now(), "INVITATION_EXPIRES_AT_INVALID"),
    requestId,
  }).strict()).mutation(({ ctx, input }) => {
    const { ideaId, ...invitation } = input;
    return invoke(() => ideaService.inviteCollaborator(ctx.user.id, ideaId, invitation));
  }),

  listInvitations: protectedProcedure.input(z.object({
    direction: z.enum(["received", "sent"]),
    ideaId: positiveId.optional(),
    status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]).optional(),
    limit,
    cursor: positiveId.optional(),
  }).strict()).query(({ ctx, input }) => invoke(() => ideaService.listInvitations(ctx.user.id, input))),

  acceptInvitation: protectedProcedure.input(z.object({ invitationId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.acceptInvitation(ctx.user.id, input.invitationId, input.requestId))),

  declineInvitation: protectedProcedure.input(z.object({ invitationId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.declineInvitation(ctx.user.id, input.invitationId, input.requestId))),

  revokeInvitation: protectedProcedure.input(z.object({ ideaId: positiveId, invitationId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.revokeInvitation(ctx.user.id, input.ideaId, input.invitationId, input.requestId))),

  getNda: protectedProcedure.input(z.object({ ideaId: positiveId }).strict())
    .query(({ ctx, input }) => invoke(() => ideaService.getNda(ctx.user.id, input.ideaId))),

  acceptNda: protectedProcedure.input(z.object({ ideaId: positiveId, identityId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.acceptNda(ctx.user.id, input.ideaId, input.identityId, input.requestId))),

  getNdaStatus: protectedProcedure.input(z.object({ ideaId: positiveId }).strict())
    .query(({ ctx, input }) => invoke(() => ideaService.getNdaStatus(ctx.user.id, input.ideaId))),

  convertToProject: protectedProcedure.input(z.object({ ideaId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => invoke(() => ideaService.convertToProject(ctx.user.id, input.ideaId, input.requestId))),
});
