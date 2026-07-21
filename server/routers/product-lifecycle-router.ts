import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  productLifecycleService,
  ProductLifecycleServiceError,
} from "../services/product-lifecycle-service";

const positiveId = z.number().int().positive();
const cursor = positiveId;
const limit = z.number().int().min(1).max(50).default(20);
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const expectedAuthorizationVersion = z.number().int().positive().optional();
const jsonObject = z.record(z.string(), z.unknown());
const modelVisibility = z.enum(["public", "owner_only", "restricted"]);
const sourceType = z.enum(["need", "idea", "project", "legacy_item", "funding_campaign"]);
const sourceRelation = z.enum(["derived_from", "validated_by", "produced_by", "migrated_from"]);
const unitStatus = z.enum([
  "registered",
  "manufactured",
  "in_use",
  "idle",
  "listed",
  "under_service",
  "transferred",
  "recycling",
  "recycled",
  "retired",
]);
const trustLevel = z.enum(["self_declared", "verified", "certified"]);
const passportVisibility = z.enum(["public", "owner", "internal"]);
const unitPassportVisibility = z.enum(["public", "owner_only", "restricted"]);

const sourceLink = z.object({
  sourceType,
  sourceId: positiveId,
  relationType: sourceRelation.optional(),
}).strict();

const notFoundCodes = new Set([
  "PRODUCT_MODEL_NOT_FOUND",
  "PRODUCT_UNIT_NOT_FOUND",
]);
const forbiddenCodes = new Set([
  "ACCOUNT_DISABLED",
  "IDENTITY_INACTIVE",
  "CAPABILITY_MISSING",
  "DATA_SCOPE_MISMATCH",
  "RESOURCE_RELATION_REQUIRED",
  "PRODUCT_SOURCE_INACCESSIBLE",
]);
const conflictCodes = new Set([
  "CONCURRENT_MODIFICATION",
  "IDEMPOTENCY_CONFLICT",
  "PRODUCT_ITEM_ALREADY_LINKED",
]);
const badRequestCodes = new Set([
  "REQUEST_ID_INVALID",
  "PRODUCT_NAME_INVALID",
  "PRODUCT_SUMMARY_INVALID",
  "PRODUCT_DESCRIPTION_INVALID",
  "PRODUCT_CATEGORY_INVALID",
  "PRODUCT_BRAND_INVALID",
  "PRODUCT_MODEL_CODE_INVALID",
  "PRODUCT_VERSION_INVALID",
  "PRODUCT_SPECIFICATIONS_INVALID",
  "PRODUCT_SOURCE_LIMIT_EXCEEDED",
  "PRODUCT_SERIAL_INVALID",
  "PRODUCT_BATCH_INVALID",
  "PRODUCT_PUBLIC_CODE_INVALID",
  "PRODUCT_UNIT_PUBLIC_CODE_INVALID",
  "PASSPORT_EVENT_TYPE_INVALID",
  "PASSPORT_DETAIL_INVALID",
  "PASSPORT_VISIBILITY_INVALID",
  "PASSPORT_SOURCE_TYPE_INVALID",
  "PASSPORT_SOURCE_ID_INVALID",
  "NEXT_OWNER_REQUIRED",
  "NEXT_OWNER_NOT_ALLOWED",
  "NEXT_OWNER_INVALID",
  "RESOURCE_STATE_FORBIDDEN",
]);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof ProductLifecycleServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
  if (notFoundCodes.has(code)) throw new TRPCError({ code: "NOT_FOUND", message: code });
  if (forbiddenCodes.has(code)) throw new TRPCError({ code: "FORBIDDEN", message: code });
  if (conflictCodes.has(code)) throw new TRPCError({ code: "CONFLICT", message: code });
  if (badRequestCodes.has(code)) throw new TRPCError({ code: "BAD_REQUEST", message: code });
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: code });
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    mapError(cause);
  }
}

export const productModelsRouter = router({
  publicList: publicProcedure.input(z.object({
    limit: limit.optional(),
    cursor: cursor.optional(),
    categoryCode: z.string().trim().min(1).max(64).optional(),
  }).strict().optional()).query(({ input }) => call(() => productLifecycleService.listPublicModels(input ?? {}))),

  publicDetail: publicProcedure.input(z.object({
    publicCode: z.string().trim().min(1).max(32),
  }).strict()).query(({ input }) => call(() => productLifecycleService.publicModelDetail(input.publicCode))),

  myList: protectedProcedure.input(z.object({
    limit: limit.optional(),
    cursor: cursor.optional(),
  }).strict().optional()).query(({ ctx, input }) => call(() => productLifecycleService.listOwnerModels(ctx.user.id, input ?? {}))),

  detail: protectedProcedure.input(z.object({ productModelId: positiveId }).strict())
    .query(({ ctx, input }) => call(() => productLifecycleService.ownerModelDetail(ctx.user.id, input.productModelId))),

  create: protectedProcedure.input(z.object({
    name: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(500),
    description: z.string().trim().max(20_000).optional(),
    categoryCode: z.string().trim().min(1).max(64),
    brandName: z.string().trim().max(128).optional(),
    modelCode: z.string().trim().max(128).optional(),
    versionLabel: z.string().trim().min(1).max(64).optional(),
    specifications: jsonObject.optional(),
    visibility: modelVisibility.optional(),
    ownerOrganizationId: positiveId.optional(),
    sourceLinks: z.array(sourceLink).max(20).optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.createModel(ctx.user.id, input))),

  update: protectedProcedure.input(z.object({
    productModelId: positiveId,
    name: z.string().trim().min(1).max(160).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    categoryCode: z.string().trim().min(1).max(64).optional(),
    brandName: z.string().trim().max(128).nullable().optional(),
    modelCode: z.string().trim().max(128).nullable().optional(),
    versionLabel: z.string().trim().min(1).max(64).optional(),
    specifications: jsonObject.optional(),
    visibility: modelVisibility.optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.updateModel(ctx.user.id, input))),

  publish: protectedProcedure.input(z.object({
    productModelId: positiveId,
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.publishModel(ctx.user.id, input))),

  retire: protectedProcedure.input(z.object({
    productModelId: positiveId,
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.retireModel(ctx.user.id, input))),

  addSource: protectedProcedure.input(z.object({
    productModelId: positiveId,
    sourceType,
    sourceId: positiveId,
    relationType: sourceRelation.optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.addSourceLink(ctx.user.id, input))),
});

export const productUnitsRouter = router({
  publicDetail: publicProcedure.input(z.object({
    publicCode: z.string().trim().min(1).max(40),
  }).strict()).query(({ input }) => call(() => productLifecycleService.publicUnitDetail(input.publicCode))),

  detail: protectedProcedure.input(z.object({ productUnitId: positiveId }).strict())
    .query(({ ctx, input }) => call(() => productLifecycleService.ownerUnitDetail(ctx.user.id, input.productUnitId))),

  register: protectedProcedure.input(z.object({
    productModelId: positiveId,
    linkedItemId: positiveId.optional(),
    serialNumber: z.string().trim().max(128).optional(),
    batchCode: z.string().trim().max(96).optional(),
    initialStatus: z.enum(["registered", "manufactured"]).optional(),
    trustLevel: trustLevel.optional(),
    passportVisibility: unitPassportVisibility.optional(),
    manufacturedAt: z.coerce.date().optional(),
    detail: jsonObject.optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.registerUnit(ctx.user.id, input))),

  linkItem: protectedProcedure.input(z.object({
    productUnitId: positiveId,
    linkedItemId: positiveId,
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.linkUnitItem(ctx.user.id, input))),

  transition: protectedProcedure.input(z.object({
    productUnitId: positiveId,
    toStatus: unitStatus,
    nextOwnerAccountId: positiveId.optional(),
    visibility: passportVisibility.optional(),
    sourceType: z.string().trim().max(64).optional(),
    sourceId: z.string().trim().max(64).optional(),
    detail: jsonObject.optional(),
    occurredAt: z.coerce.date().optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.transitionUnit(ctx.user.id, input))),

  appendPassport: protectedProcedure.input(z.object({
    productUnitId: positiveId,
    eventType: z.string().trim().min(1).max(64),
    visibility: passportVisibility.optional(),
    sourceType: z.string().trim().max(64).optional(),
    sourceId: z.string().trim().max(64).optional(),
    detail: jsonObject.optional(),
    occurredAt: z.coerce.date().optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => productLifecycleService.appendPassport(ctx.user.id, input))),
});
