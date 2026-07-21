import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  fundingCampaignService,
  FundingCampaignServiceError,
} from "../services/funding-campaign-service";

const positiveId = z.number().int().positive();
const limit = z.number().int().min(1).max(50).default(20);
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const expectedAuthorizationVersion = z.number().int().positive().optional();
const campaignStatus = z.enum(["draft", "reviewing", "active", "succeeded", "failed", "cancelled", "closed"]);
const publicCampaignStatus = z.enum(["active", "succeeded", "failed", "cancelled", "closed"]);
const sourceType = z.enum(["need", "idea", "project", "product_model"]);
const closeStatus = z.enum(["succeeded", "failed", "cancelled", "closed"]);
const evidence = z.object({
  type: z.enum(["need", "survey", "prototype", "certification", "other"]),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1000),
  sourceUrl: z.string().trim().url().max(1000).optional(),
  verifiedAt: z.coerce.date().optional(),
}).strict();

const notFoundCodes = new Set([
  "CAMPAIGN_NOT_FOUND",
  "PLEDGE_NOT_FOUND",
]);
const forbiddenCodes = new Set([
  "ACCOUNT_DISABLED",
  "IDENTITY_INACTIVE",
  "CAPABILITY_MISSING",
  "DATA_SCOPE_MISMATCH",
  "RESOURCE_RELATION_REQUIRED",
  "CAMPAIGN_SOURCE_FORBIDDEN",
  "CAMPAIGN_SELF_PLEDGE_FORBIDDEN",
]);
const conflictCodes = new Set([
  "CONCURRENT_MODIFICATION",
  "IDEMPOTENCY_CONFLICT",
  "CAMPAIGN_SOURCE_ALREADY_ACTIVE",
  "PLEDGE_ALREADY_ACTIVE",
]);
const badRequestCodes = new Set([
  "REQUEST_ID_INVALID",
  "CAMPAIGN_TITLE_INVALID",
  "CAMPAIGN_SUMMARY_INVALID",
  "CAMPAIGN_DESCRIPTION_INVALID",
  "CAMPAIGN_CATEGORY_INVALID",
  "CAMPAIGN_COVER_URL_INVALID",
  "CAMPAIGN_GOAL_INVALID",
  "CAMPAIGN_EVIDENCE_INVALID",
  "CAMPAIGN_EVIDENCE_URL_INVALID",
  "CAMPAIGN_EVIDENCE_DATE_INVALID",
  "CAMPAIGN_EVIDENCE_TITLE_INVALID",
  "CAMPAIGN_EVIDENCE_SUMMARY_INVALID",
  "CAMPAIGN_VERIFICATION_INVALID",
  "CAMPAIGN_RISK_INVALID",
  "CAMPAIGN_START_DATE_INVALID",
  "CAMPAIGN_END_DATE_INVALID",
  "CAMPAIGN_DATE_RANGE_INVALID",
  "CAMPAIGN_SOURCE_INVALID",
  "CAMPAIGN_UPDATE_EMPTY",
  "CAMPAIGN_GOAL_BELOW_PLEDGES",
  "CAMPAIGN_EVIDENCE_REQUIRED",
  "CAMPAIGN_END_DATE_REQUIRED",
  "CAMPAIGN_GOAL_NOT_REACHED",
  "CAMPAIGN_NOT_OPEN",
  "CAMPAIGN_CLOSE_REASON_INVALID",
  "CAMPAIGN_PUBLIC_CODE_INVALID",
  "PLEDGE_QUANTITY_INVALID",
  "PLEDGE_NOTE_INVALID",
  "PLEDGE_CITY_INVALID",
  "RESOURCE_STATE_FORBIDDEN",
]);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof FundingCampaignServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
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

export const fundingCampaignsRouter = router({
  publicList: publicProcedure.input(z.object({
    limit: limit.optional(),
    cursor: positiveId.optional(),
    status: publicCampaignStatus.optional(),
    categoryCode: z.string().trim().min(1).max(64).optional(),
  }).strict().optional()).query(({ input }) => call(() => fundingCampaignService.listPublic(input ?? {}))),

  publicDetail: publicProcedure.input(z.object({
    publicCode: z.string().trim().min(1).max(32),
  }).strict()).query(({ input }) => call(() => fundingCampaignService.publicDetail(input.publicCode))),

  publicTimeline: publicProcedure.input(z.object({
    publicCode: z.string().trim().min(1).max(32),
  }).strict()).query(({ input }) => call(() => fundingCampaignService.publicTimeline(input.publicCode))),

  myList: protectedProcedure.query(({ ctx }) => call(() => fundingCampaignService.listMine(ctx.user.id))),

  detail: protectedProcedure.input(z.object({ campaignId: positiveId }).strict())
    .query(({ ctx, input }) => call(() => fundingCampaignService.ownerDetail(ctx.user.id, input.campaignId))),

  create: protectedProcedure.input(z.object({
    sourceType,
    sourceId: positiveId,
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(20_000),
    categoryCode: z.string().trim().min(1).max(64),
    coverUrl: z.string().trim().url().max(1000).optional(),
    goalQuantity: z.number().int().min(1).max(1_000_000),
    evidence: z.array(evidence).max(20).optional(),
    verificationSummary: z.string().trim().max(5000).optional(),
    riskSummary: z.string().trim().min(1).max(5000),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.createCampaign(ctx.user.id, input))),

  update: protectedProcedure.input(z.object({
    campaignId: positiveId,
    title: z.string().trim().min(1).max(160).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    categoryCode: z.string().trim().min(1).max(64).optional(),
    coverUrl: z.string().trim().url().max(1000).nullable().optional(),
    goalQuantity: z.number().int().min(1).max(1_000_000).optional(),
    evidence: z.array(evidence).max(20).optional(),
    verificationSummary: z.string().trim().max(5000).nullable().optional(),
    riskSummary: z.string().trim().min(1).max(5000).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.updateCampaign(ctx.user.id, input))),

  publish: protectedProcedure.input(z.object({
    campaignId: positiveId,
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.publishCampaign(ctx.user.id, input))),

  close: protectedProcedure.input(z.object({
    campaignId: positiveId,
    targetStatus: closeStatus,
    reason: z.string().trim().max(1000).optional(),
    expectedAuthorizationVersion,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.closeCampaign(ctx.user.id, input))),

  statusOptions: publicProcedure.query(() => campaignStatus.options),
});

export const fundingPledgesRouter = router({
  myList: protectedProcedure.query(({ ctx }) => call(() => fundingCampaignService.listMyPledges(ctx.user.id))),

  campaignList: protectedProcedure.input(z.object({ campaignId: positiveId }).strict())
    .query(({ ctx, input }) => call(() => fundingCampaignService.listCampaignPledges(ctx.user.id, input.campaignId))),

  register: protectedProcedure.input(z.object({
    publicCode: z.string().trim().min(1).max(32),
    quantity: z.number().int().min(1).max(1000),
    note: z.string().trim().max(2000).optional(),
    cityName: z.string().trim().max(100).optional(),
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.registerPledge(ctx.user.id, input))),

  withdraw: protectedProcedure.input(z.object({
    pledgeId: positiveId,
    requestId,
  }).strict()).mutation(({ ctx, input }) => call(() => fundingCampaignService.withdrawPledge(ctx.user.id, input))),
});
