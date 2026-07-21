import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  CONTENT_RELATION_TYPES,
  CONTENT_SOURCES,
  CONTENT_TYPES,
  DISCOVERY_CHANNELS,
  ContentServiceError,
  contentService,
} from "../services/content-service";

const positiveId = z.number().int().positive();
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const contentType = z.enum(CONTENT_TYPES);
const sourceType = z.enum(CONTENT_SOURCES);
const visibility = z.enum(["public", "followers", "private"]);
const status = z.enum(["draft", "ready_to_publish", "reviewing", "published", "rejected", "recommendation_limited", "unpublished", "author_deleted", "platform_banned"]);

const draftFields = {
  contentType,
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().min(1).max(50_000),
  locationLabel: z.string().trim().max(100).nullable().optional(),
  visibility: visibility.optional(),
  sourceType: sourceType.optional(),
  sourceStatement: z.string().trim().max(500).nullable().optional(),
  allowComments: z.boolean().optional(),
  authorIdentityId: positiveId.nullable().optional(),
  organizationId: positiveId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
};

const relation = z.object({
  relationType: z.enum(CONTENT_RELATION_TYPES),
  relationId: positiveId,
  relationLabel: z.string().trim().min(1).max(180).optional(),
}).strict();

const media = z.object({
  fileId: positiveId,
  mediaType: z.enum(["image", "video"]),
  purpose: z.enum(["cover", "body"]).optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
}).strict();

const notFoundCodes = new Set(["CONTENT_NOT_FOUND", "COMMENT_NOT_FOUND", "PARENT_COMMENT_NOT_FOUND", "AUTHOR_NOT_FOUND"]);
const forbiddenCodes = new Set(["AUTHOR_IDENTITY_FORBIDDEN", "ORGANIZATION_CONTEXT_FORBIDDEN", "CONTENT_RELATION_FORBIDDEN", "COMMENT_DELETE_FORBIDDEN", "SELF_FOLLOW_FORBIDDEN"]);
const conflictCodes = new Set(["IDEMPOTENCY_CONFLICT"]);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof ContentServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
  if (notFoundCodes.has(code)) throw new TRPCError({ code: "NOT_FOUND", message: code });
  if (forbiddenCodes.has(code)) throw new TRPCError({ code: "FORBIDDEN", message: code });
  if (conflictCodes.has(code)) throw new TRPCError({ code: "CONFLICT", message: code });
  if (cause instanceof ContentServiceError) throw new TRPCError({ code: "BAD_REQUEST", message: code });
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: code });
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    mapError(cause);
  }
}

export const contentRouter = router({
  createDraft: protectedProcedure.input(z.object({ ...draftFields, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.createDraft(ctx.user.id, input))),

  saveDraft: protectedProcedure.input(z.object({
    postId: positiveId,
    contentType: contentType.optional(),
    title: draftFields.title.optional(),
    summary: draftFields.summary,
    body: draftFields.body.optional(),
    locationLabel: draftFields.locationLabel,
    visibility: visibility.optional(),
    sourceType: sourceType.optional(),
    sourceStatement: draftFields.sourceStatement,
    allowComments: z.boolean().optional(),
    authorIdentityId: positiveId.nullable().optional(),
    organizationId: positiveId.nullable().optional(),
    tags: draftFields.tags,
    requestId,
  }).strict()).mutation(({ ctx, input }) => {
    const { postId, ...values } = input;
    return call(() => contentService.saveDraft(ctx.user.id, postId, values));
  }),

  replaceMedia: protectedProcedure.input(z.object({ postId: positiveId, media: z.array(media).max(20), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.replaceMedia(ctx.user.id, input.postId, input.media, input.requestId))),

  replaceRelations: protectedProcedure.input(z.object({ postId: positiveId, relations: z.array(relation).max(20), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.replaceRelations(ctx.user.id, input.postId, input.relations, input.requestId))),

  aiSuggest: protectedProcedure.input(z.object({ postId: positiveId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.suggestWithAi(ctx.user.id, input.postId))),

  confirmAi: protectedProcedure.input(z.object({ postId: positiveId, title: draftFields.title, summary: draftFields.summary, tags: draftFields.tags, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.confirmAi(ctx.user.id, input.postId, input))),

  publish: protectedProcedure.input(z.object({ postId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.publish(ctx.user.id, input.postId, input.requestId))),

  detail: publicProcedure.input(z.object({ postId: positiveId }).strict())
    .query(({ ctx, input }) => call(() => contentService.detail(input.postId, ctx.user?.id))),

  discover: publicProcedure.input(z.object({
    channel: z.enum(DISCOVERY_CHANNELS).default("recommended"),
    cursor: positiveId.optional(),
    limit: z.number().int().min(1).max(50).default(20),
    locationLabel: z.string().trim().min(1).max(100).optional(),
  }).strict().optional()).query(({ ctx, input }) => call(() => contentService.discover(input ?? {}, ctx.user?.id))),

  mine: protectedProcedure.input(z.object({ status: status.optional(), cursor: positiveId.optional(), limit: z.number().int().min(1).max(50).default(20) }).strict().optional())
    .query(({ ctx, input }) => call(() => contentService.mine(ctx.user.id, input ?? {}))),

  creatorDashboard: protectedProcedure.query(({ ctx }) => call(() => contentService.dashboard(ctx.user.id))),

  setLike: protectedProcedure.input(z.object({ postId: positiveId, active: z.boolean(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.setInteraction(ctx.user.id, input.postId, "like", input.active, input.requestId))),

  setFavorite: protectedProcedure.input(z.object({ postId: positiveId, active: z.boolean(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.setInteraction(ctx.user.id, input.postId, "favorite", input.active, input.requestId))),

  recordInteraction: protectedProcedure.input(z.object({ postId: positiveId, interactionType: z.enum(["view", "share", "product_click", "listing_click", "idea_click"]), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.recordInteraction(ctx.user.id, input.postId, input.interactionType, input.requestId))),

  addComment: protectedProcedure.input(z.object({ postId: positiveId, body: z.string().trim().min(1).max(2000), parentCommentId: positiveId.optional(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.addComment(ctx.user.id, input.postId, input.body, input.requestId, input.parentCommentId))),

  deleteComment: protectedProcedure.input(z.object({ commentId: positiveId, requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.deleteComment(ctx.user.id, input.commentId, input.requestId))),

  setFollow: protectedProcedure.input(z.object({ followedAccountId: positiveId, active: z.boolean(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.setFollow(ctx.user.id, input.followedAccountId, input.active, input.requestId))),

  report: protectedProcedure.input(z.object({ postId: positiveId, reasonCode: z.string().trim().min(1).max(64), detail: z.string().trim().max(1000).optional(), requestId }).strict())
    .mutation(({ ctx, input }) => call(() => contentService.report(ctx.user.id, input.postId, input.reasonCode, input.detail, input.requestId))),
});
