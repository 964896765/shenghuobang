import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";

import {
  fundingCampaignEvents,
  fundingCampaigns,
  fundingPledges,
  ideas,
  needs,
  productModels,
  projectMemberships,
  projects,
  userProfiles,
  users,
} from "../../drizzle/schema";
import { getAuthorizationService } from "../authorization";
import type { AuthorizationRequest, AuthorizationResult } from "../authorization";
import { requireDb } from "../db";
import { writeAudit } from "./audit-service";

export type FundingCampaignSourceType = "need" | "idea" | "project" | "product_model";
export type FundingCampaignStatus = "draft" | "reviewing" | "active" | "succeeded" | "failed" | "cancelled" | "closed";
export type FundingCampaignTerminalStatus = "succeeded" | "failed" | "cancelled" | "closed";

export interface FundingCampaignEvidenceInput {
  type: "need" | "survey" | "prototype" | "certification" | "other";
  title: string;
  summary: string;
  sourceUrl?: string;
  verifiedAt?: Date;
}

export interface FundingCampaignCreateInput {
  sourceType: FundingCampaignSourceType;
  sourceId: number;
  title: string;
  summary: string;
  description: string;
  categoryCode: string;
  coverUrl?: string;
  goalQuantity: number;
  evidence?: FundingCampaignEvidenceInput[];
  verificationSummary?: string;
  riskSummary: string;
  startsAt?: Date;
  endsAt?: Date;
  requestId: string;
}

export interface FundingCampaignUpdateInput {
  campaignId: number;
  title?: string;
  summary?: string;
  description?: string;
  categoryCode?: string;
  coverUrl?: string | null;
  goalQuantity?: number;
  evidence?: FundingCampaignEvidenceInput[];
  verificationSummary?: string | null;
  riskSummary?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface FundingCampaignActionInput {
  campaignId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface FundingCampaignCloseInput extends FundingCampaignActionInput {
  targetStatus: FundingCampaignTerminalStatus;
  reason?: string;
}

export interface FundingPledgeRegisterInput {
  publicCode: string;
  quantity: number;
  note?: string;
  cityName?: string;
  requestId: string;
}

export interface FundingPledgeWithdrawInput {
  pledgeId: number;
  requestId: string;
}

export interface FundingAuthorizationPort {
  authorize(accountId: number, request: Omit<AuthorizationRequest, "accountId">): Promise<AuthorizationResult>;
}

const runtimeAuthorization: FundingAuthorizationPort = {
  authorize: (accountId, request) => getAuthorizationService().authorize({ accountId, ...request }),
};

const PUBLIC_CAMPAIGN_STATUSES: FundingCampaignStatus[] = ["active", "succeeded", "failed", "cancelled", "closed"];
const TERMINAL_CAMPAIGN_STATUSES = new Set<FundingCampaignStatus>(["succeeded", "failed", "cancelled", "closed"]);
const CAMPAIGN_TRANSITIONS: Readonly<Record<FundingCampaignStatus, ReadonlySet<FundingCampaignStatus>>> = {
  draft: new Set(["reviewing", "active", "cancelled"]),
  reviewing: new Set(["draft", "active", "cancelled"]),
  active: new Set(["succeeded", "failed", "cancelled", "closed"]),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  closed: new Set(),
};

export class FundingCampaignServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "FundingCampaignServiceError";
  }
}

export function assertFundingCampaignTransition(fromStatus: FundingCampaignStatus, toStatus: FundingCampaignStatus): void {
  if (fromStatus === toStatus) return;
  if (!CAMPAIGN_TRANSITIONS[fromStatus]?.has(toStatus)) {
    throw new FundingCampaignServiceError("RESOURCE_STATE_FORBIDDEN");
  }
}

function ensureRequestId(value: string): string {
  const result = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(result)) throw new FundingCampaignServiceError("REQUEST_ID_INVALID");
  return result;
}

function cleanText(value: string, code: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new FundingCampaignServiceError(code);
  return result;
}

function optionalText(value: string | null | undefined, code: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = value.trim();
  if (!result) return null;
  if (result.length > max) throw new FundingCampaignServiceError(code);
  return result;
}

function positiveInteger(value: number, code: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new FundingCampaignServiceError(code);
  return value;
}

function validDate(value: Date | null | undefined, code: string): Date | null | undefined {
  if (value == null) return value;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new FundingCampaignServiceError(code);
  return value;
}

function normalizeEvidence(input: FundingCampaignEvidenceInput[] | undefined): Array<Record<string, unknown>> {
  const rows = input ?? [];
  if (rows.length > 20) throw new FundingCampaignServiceError("CAMPAIGN_EVIDENCE_INVALID");
  return rows.map((row) => {
    const sourceUrl = optionalText(row.sourceUrl, "CAMPAIGN_EVIDENCE_URL_INVALID", 1000);
    const verifiedAt = validDate(row.verifiedAt, "CAMPAIGN_EVIDENCE_DATE_INVALID");
    return {
      type: row.type,
      title: cleanText(row.title, "CAMPAIGN_EVIDENCE_TITLE_INVALID", 120),
      summary: cleanText(row.summary, "CAMPAIGN_EVIDENCE_SUMMARY_INVALID", 1000),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(verifiedAt ? { verifiedAt: verifiedAt.toISOString() } : {}),
    };
  });
}

function assertExpectedVersion(current: number, expected?: number): void {
  if (expected != null && current !== expected) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
}

function campaignPublicCode(): string {
  return `FC-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

function activeSourceKey(sourceType: FundingCampaignSourceType, sourceId: number): string {
  return `funding:${sourceType}:${sourceId}`;
}

function activePledgeKey(campaignId: number, supporterAccountId: number): string {
  return `funding:${campaignId}:${supporterAccountId}`;
}

async function requireAllowed(
  authorization: FundingAuthorizationPort,
  accountId: number,
  request: Omit<AuthorizationRequest, "accountId">,
): Promise<AuthorizationResult> {
  const result = await authorization.authorize(accountId, request);
  if (!result.allowed) throw new FundingCampaignServiceError(result.reasonCode);
  return result;
}

async function auditSafely(input: Parameters<typeof writeAudit>[0]): Promise<void> {
  try {
    await writeAudit(input);
  } catch {
    // Permission audit remains authoritative if this compatibility audit writer is unavailable.
  }
}

async function runAudited<T>(input: {
  accountId: number;
  action: string;
  resourceType: "funding_campaign" | "funding_pledge";
  resourceId?: number;
  riskLevel: "normal" | "sensitive" | "high";
  requestId: string;
  operation: () => Promise<T>;
}): Promise<T> {
  try {
    const result = await input.operation();
    await auditSafely({
      actorId: input.accountId,
      actorRole: "user",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: "success",
      riskLevel: input.riskLevel,
      detail: { requestId: input.requestId },
    });
    return result;
  } catch (error) {
    const reasonCode = error instanceof FundingCampaignServiceError ? error.code : "UNEXPECTED_ERROR";
    await auditSafely({
      actorId: input.accountId,
      actorRole: "user",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: error instanceof FundingCampaignServiceError ? "denied" : "failed",
      riskLevel: input.riskLevel,
      detail: { requestId: input.requestId, reasonCode },
    });
    throw error;
  }
}

function campaignOwnerView(row: typeof fundingCampaigns.$inferSelect) {
  return {
    id: row.id,
    publicCode: row.publicCode,
    ownerAccountId: row.ownerAccountId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    summary: row.summary,
    description: row.description,
    categoryCode: row.categoryCode,
    coverUrl: row.coverUrl,
    goalQuantity: row.goalQuantity,
    pledgedQuantity: row.pledgedQuantity,
    activePledgeCount: row.activePledgeCount,
    evidence: row.evidence,
    verificationSummary: row.verificationSummary,
    riskSummary: row.riskSummary,
    visibility: row.visibility,
    status: row.status,
    authorizationVersion: row.authorizationVersion,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    publishedAt: row.publishedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function campaignPublicView(row: typeof fundingCampaigns.$inferSelect) {
  return {
    publicCode: row.publicCode,
    sourceType: row.sourceType,
    title: row.title,
    summary: row.summary,
    description: row.description,
    categoryCode: row.categoryCode,
    coverUrl: row.coverUrl,
    goalQuantity: row.goalQuantity,
    pledgedQuantity: row.pledgedQuantity,
    activePledgeCount: row.activePledgeCount,
    evidence: row.evidence,
    verificationSummary: row.verificationSummary,
    riskSummary: row.riskSummary,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    publishedAt: row.publishedAt,
    closedAt: row.closedAt,
    updatedAt: row.updatedAt,
    progressPercent: row.goalQuantity > 0 ? Math.min(100, Math.round((row.pledgedQuantity / row.goalQuantity) * 100)) : 0,
    disclaimer: "支持意向不构成订单、支付、股权、投资或收益承诺。",
  };
}

type FundingDatabase = Awaited<ReturnType<typeof requireDb>>;
type FundingTransaction = Parameters<Parameters<FundingDatabase["transaction"]>[0]>[0];

async function sourceOwnedBy(
  tx: FundingTransaction,
  accountId: number,
  sourceType: FundingCampaignSourceType,
  sourceId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return false;
  if (sourceType === "need") {
    const [row] = await tx.select({ creatorId: needs.creatorId }).from(needs).where(eq(needs.id, sourceId)).limit(1);
    return row?.creatorId === accountId;
  }
  if (sourceType === "idea") {
    const [row] = await tx.select({ creatorAccountId: ideas.creatorAccountId, deletedAt: ideas.deletedAt })
      .from(ideas).where(eq(ideas.id, sourceId)).limit(1);
    return Boolean(row && !row.deletedAt && row.creatorAccountId === accountId);
  }
  if (sourceType === "product_model") {
    const [row] = await tx.select({ ownerAccountId: productModels.ownerAccountId, deletedAt: productModels.deletedAt })
      .from(productModels).where(eq(productModels.id, sourceId)).limit(1);
    return Boolean(row && !row.deletedAt && row.ownerAccountId === accountId);
  }
  const [project] = await tx.select({ ownerId: projects.ownerId, engineerId: projects.engineerId })
    .from(projects).where(eq(projects.id, sourceId)).limit(1);
  if (!project) return false;
  if (project.ownerId === accountId || project.engineerId === accountId) return true;
  const [membership] = await tx.select({ id: projectMemberships.id }).from(projectMemberships).where(and(
    eq(projectMemberships.projectId, sourceId),
    eq(projectMemberships.accountId, accountId),
    eq(projectMemberships.status, "active"),
  )).limit(1);
  return Boolean(membership);
}

async function appendCampaignEvent(
  tx: FundingTransaction,
  input: {
    campaignId: number;
    eventType: string;
    actorAccountId: number;
    fromStatus?: FundingCampaignStatus | null;
    toStatus?: FundingCampaignStatus | null;
    pledgeId?: number | null;
    requestId: string;
    detail?: Record<string, unknown>;
    occurredAt?: Date;
  },
): Promise<{ event: typeof fundingCampaignEvents.$inferSelect; duplicate: boolean }> {
  const [existing] = await tx.select().from(fundingCampaignEvents).where(eq(fundingCampaignEvents.requestId, input.requestId)).limit(1);
  if (existing) {
    if (existing.campaignId !== input.campaignId || existing.eventType !== input.eventType) {
      throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
    }
    return { event: existing, duplicate: true };
  }
  const [last] = await tx.select({ sequenceNumber: fundingCampaignEvents.sequenceNumber }).from(fundingCampaignEvents)
    .where(eq(fundingCampaignEvents.campaignId, input.campaignId))
    .orderBy(desc(fundingCampaignEvents.sequenceNumber))
    .for("update")
    .limit(1);
  const result = await tx.insert(fundingCampaignEvents).values({
    campaignId: input.campaignId,
    sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
    eventType: cleanText(input.eventType, "CAMPAIGN_EVENT_TYPE_INVALID", 64),
    actorAccountId: input.actorAccountId,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    pledgeId: input.pledgeId ?? null,
    requestId: input.requestId,
    detail: input.detail ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  });
  const [created] = await tx.select().from(fundingCampaignEvents)
    .where(eq(fundingCampaignEvents.id, Number(result[0].insertId))).limit(1);
  if (!created) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
  return { event: created, duplicate: false };
}

async function recalculatePledgeTotals(tx: FundingTransaction, campaignId: number): Promise<{ quantity: number; count: number }> {
  const rows = await tx.select({ quantity: fundingPledges.quantity }).from(fundingPledges).where(and(
    eq(fundingPledges.campaignId, campaignId),
    eq(fundingPledges.status, "active"),
  ));
  return {
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    count: rows.length,
  };
}

function editableCampaign(row: typeof fundingCampaigns.$inferSelect): void {
  if (row.deletedAt || !["draft", "reviewing"].includes(row.status)) {
    throw new FundingCampaignServiceError("RESOURCE_STATE_FORBIDDEN");
  }
}

export class FundingCampaignService {
  constructor(private readonly authorization: FundingAuthorizationPort = runtimeAuthorization) {}

  async createCampaign(accountId: number, input: FundingCampaignCreateInput) {
    const requestId = ensureRequestId(input.requestId);
    return runAudited({
      accountId,
      action: "funding.campaign.create",
      resourceType: "funding_campaign",
      riskLevel: "normal",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.campaign.create",
          purpose: "funding_campaign_create",
          requestId,
        });
        const sourceId = positiveInteger(input.sourceId, "CAMPAIGN_SOURCE_INVALID", Number.MAX_SAFE_INTEGER);
        const values = {
          title: cleanText(input.title, "CAMPAIGN_TITLE_INVALID", 160),
          summary: cleanText(input.summary, "CAMPAIGN_SUMMARY_INVALID", 500),
          description: cleanText(input.description, "CAMPAIGN_DESCRIPTION_INVALID", 20_000),
          categoryCode: cleanText(input.categoryCode, "CAMPAIGN_CATEGORY_INVALID", 64),
          coverUrl: optionalText(input.coverUrl, "CAMPAIGN_COVER_URL_INVALID", 1000) ?? null,
          goalQuantity: positiveInteger(input.goalQuantity, "CAMPAIGN_GOAL_INVALID", 1_000_000),
          evidence: normalizeEvidence(input.evidence),
          verificationSummary: optionalText(input.verificationSummary, "CAMPAIGN_VERIFICATION_INVALID", 5000) ?? null,
          riskSummary: cleanText(input.riskSummary, "CAMPAIGN_RISK_INVALID", 5000),
          startsAt: validDate(input.startsAt, "CAMPAIGN_START_DATE_INVALID") ?? null,
          endsAt: validDate(input.endsAt, "CAMPAIGN_END_DATE_INVALID") ?? null,
        };
        if (values.startsAt && values.endsAt && values.endsAt <= values.startsAt) {
          throw new FundingCampaignServiceError("CAMPAIGN_DATE_RANGE_INVALID");
        }
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [existingByRequest] = await tx.select().from(fundingCampaigns)
            .where(eq(fundingCampaigns.createdRequestId, requestId)).for("update").limit(1);
          if (existingByRequest) {
            if (existingByRequest.ownerAccountId !== accountId || existingByRequest.sourceType !== input.sourceType || existingByRequest.sourceId !== sourceId) {
              throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            }
            return { campaign: campaignOwnerView(existingByRequest), duplicate: true };
          }
          if (!(await sourceOwnedBy(tx, accountId, input.sourceType, sourceId))) {
            throw new FundingCampaignServiceError("CAMPAIGN_SOURCE_FORBIDDEN");
          }
          const sourceDedupeKey = activeSourceKey(input.sourceType, sourceId);
          const [activeExisting] = await tx.select({ id: fundingCampaigns.id }).from(fundingCampaigns)
            .where(eq(fundingCampaigns.activeSourceDedupeKey, sourceDedupeKey)).for("update").limit(1);
          if (activeExisting) throw new FundingCampaignServiceError("CAMPAIGN_SOURCE_ALREADY_ACTIVE");
          const result = await tx.insert(fundingCampaigns).values({
            publicCode: campaignPublicCode(),
            ownerAccountId: accountId,
            sourceType: input.sourceType,
            sourceId,
            ...values,
            pledgedQuantity: 0,
            activePledgeCount: 0,
            visibility: "owner_only",
            status: "draft",
            authorizationVersion: 1,
            activeSourceDedupeKey: sourceDedupeKey,
            createdRequestId: requestId,
            lastRequestId: requestId,
          });
          const campaignId = Number(result[0].insertId);
          await appendCampaignEvent(tx, {
            campaignId,
            eventType: "campaign_created",
            actorAccountId: accountId,
            toStatus: "draft",
            requestId,
            detail: { goalQuantity: values.goalQuantity, sourceType: input.sourceType },
          });
          const [created] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, campaignId)).limit(1);
          if (!created) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { campaign: campaignOwnerView(created), duplicate: false };
        });
      },
    });
  }

  async updateCampaign(accountId: number, input: FundingCampaignUpdateInput) {
    const requestId = ensureRequestId(input.requestId);
    return runAudited({
      accountId,
      action: "funding.campaign.edit",
      resourceType: "funding_campaign",
      resourceId: input.campaignId,
      riskLevel: "sensitive",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.campaign.edit",
          resourceType: "funding_campaign",
          resourceId: String(input.campaignId),
          purpose: "funding_campaign_edit",
          requestId,
        });
        const changes: {
          title?: string;
          summary?: string;
          description?: string;
          categoryCode?: string;
          coverUrl?: string | null;
          goalQuantity?: number;
          evidence?: Array<Record<string, unknown>>;
          verificationSummary?: string | null;
          riskSummary?: string;
          startsAt?: Date | null;
          endsAt?: Date | null;
        } = {};
        if (input.title !== undefined) changes.title = cleanText(input.title, "CAMPAIGN_TITLE_INVALID", 160);
        if (input.summary !== undefined) changes.summary = cleanText(input.summary, "CAMPAIGN_SUMMARY_INVALID", 500);
        if (input.description !== undefined) changes.description = cleanText(input.description, "CAMPAIGN_DESCRIPTION_INVALID", 20_000);
        if (input.categoryCode !== undefined) changes.categoryCode = cleanText(input.categoryCode, "CAMPAIGN_CATEGORY_INVALID", 64);
        if (input.coverUrl !== undefined) changes.coverUrl = optionalText(input.coverUrl, "CAMPAIGN_COVER_URL_INVALID", 1000) ?? null;
        if (input.goalQuantity !== undefined) changes.goalQuantity = positiveInteger(input.goalQuantity, "CAMPAIGN_GOAL_INVALID", 1_000_000);
        if (input.evidence !== undefined) changes.evidence = normalizeEvidence(input.evidence);
        if (input.verificationSummary !== undefined) changes.verificationSummary = optionalText(input.verificationSummary, "CAMPAIGN_VERIFICATION_INVALID", 5000) ?? null;
        if (input.riskSummary !== undefined) changes.riskSummary = cleanText(input.riskSummary, "CAMPAIGN_RISK_INVALID", 5000);
        if (input.startsAt !== undefined) changes.startsAt = validDate(input.startsAt, "CAMPAIGN_START_DATE_INVALID") ?? null;
        if (input.endsAt !== undefined) changes.endsAt = validDate(input.endsAt, "CAMPAIGN_END_DATE_INVALID") ?? null;
        if (Object.keys(changes).length === 0) throw new FundingCampaignServiceError("CAMPAIGN_UPDATE_EMPTY");
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [row] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, input.campaignId)).for("update").limit(1);
          if (!row || row.ownerAccountId !== accountId || row.deletedAt) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
          const [existingEvent] = await tx.select().from(fundingCampaignEvents).where(eq(fundingCampaignEvents.requestId, requestId)).limit(1);
          if (existingEvent) {
            if (existingEvent.campaignId !== row.id || existingEvent.eventType !== "campaign_updated") throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            return { campaign: campaignOwnerView(row), duplicate: true };
          }
          editableCampaign(row);
          assertExpectedVersion(row.authorizationVersion, input.expectedAuthorizationVersion);
          const nextStartsAt = changes.startsAt === undefined ? row.startsAt : changes.startsAt;
          const nextEndsAt = changes.endsAt === undefined ? row.endsAt : changes.endsAt;
          if (nextStartsAt && nextEndsAt && nextEndsAt <= nextStartsAt) throw new FundingCampaignServiceError("CAMPAIGN_DATE_RANGE_INVALID");
          const nextGoal = changes.goalQuantity ?? row.goalQuantity;
          if (nextGoal < row.pledgedQuantity) throw new FundingCampaignServiceError("CAMPAIGN_GOAL_BELOW_PLEDGES");
          await tx.update(fundingCampaigns).set({
            ...changes,
            authorizationVersion: row.authorizationVersion + 1,
            lastRequestId: requestId,
          }).where(eq(fundingCampaigns.id, row.id));
          await appendCampaignEvent(tx, {
            campaignId: row.id,
            eventType: "campaign_updated",
            actorAccountId: accountId,
            fromStatus: row.status,
            toStatus: row.status,
            requestId,
            detail: { changedFields: Object.keys(changes).sort() },
          });
          const [updated] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, row.id)).limit(1);
          if (!updated) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { campaign: campaignOwnerView(updated), duplicate: false };
        });
      },
    });
  }

  async publishCampaign(accountId: number, input: FundingCampaignActionInput) {
    const requestId = ensureRequestId(input.requestId);
    return runAudited({
      accountId,
      action: "funding.campaign.publish",
      resourceType: "funding_campaign",
      resourceId: input.campaignId,
      riskLevel: "high",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.campaign.publish",
          resourceType: "funding_campaign",
          resourceId: String(input.campaignId),
          purpose: "funding_campaign_publish",
          requestId,
        });
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [row] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, input.campaignId)).for("update").limit(1);
          if (!row || row.ownerAccountId !== accountId || row.deletedAt) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
          const [existingEvent] = await tx.select().from(fundingCampaignEvents).where(eq(fundingCampaignEvents.requestId, requestId)).limit(1);
          if (existingEvent) {
            if (existingEvent.campaignId !== row.id || existingEvent.eventType !== "campaign_published") throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            return { campaign: campaignOwnerView(row), duplicate: true };
          }
          assertFundingCampaignTransition(row.status, "active");
          assertExpectedVersion(row.authorizationVersion, input.expectedAuthorizationVersion);
          if (!Array.isArray(row.evidence) || row.evidence.length === 0) throw new FundingCampaignServiceError("CAMPAIGN_EVIDENCE_REQUIRED");
          const now = new Date();
          const startsAt = row.startsAt ?? now;
          if (!row.endsAt || row.endsAt <= startsAt || row.endsAt <= now) throw new FundingCampaignServiceError("CAMPAIGN_END_DATE_REQUIRED");
          await tx.update(fundingCampaigns).set({
            status: "active",
            visibility: "public",
            startsAt,
            publishedAt: now,
            authorizationVersion: row.authorizationVersion + 1,
            lastRequestId: requestId,
          }).where(eq(fundingCampaigns.id, row.id));
          await appendCampaignEvent(tx, {
            campaignId: row.id,
            eventType: "campaign_published",
            actorAccountId: accountId,
            fromStatus: row.status,
            toStatus: "active",
            requestId,
            detail: { goalQuantity: row.goalQuantity, endsAt: row.endsAt.toISOString() },
            occurredAt: now,
          });
          const [updated] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, row.id)).limit(1);
          if (!updated) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { campaign: campaignOwnerView(updated), duplicate: false };
        });
      },
    });
  }

  async closeCampaign(accountId: number, input: FundingCampaignCloseInput) {
    const requestId = ensureRequestId(input.requestId);
    return runAudited({
      accountId,
      action: "funding.campaign.close",
      resourceType: "funding_campaign",
      resourceId: input.campaignId,
      riskLevel: "high",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.campaign.close",
          resourceType: "funding_campaign",
          resourceId: String(input.campaignId),
          purpose: "funding_campaign_close",
          requestId,
        });
        const reason = optionalText(input.reason, "CAMPAIGN_CLOSE_REASON_INVALID", 1000) ?? null;
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [row] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, input.campaignId)).for("update").limit(1);
          if (!row || row.ownerAccountId !== accountId || row.deletedAt) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
          const [existingEvent] = await tx.select().from(fundingCampaignEvents).where(eq(fundingCampaignEvents.requestId, requestId)).limit(1);
          if (existingEvent) {
            if (existingEvent.campaignId !== row.id || existingEvent.eventType !== "campaign_closed") throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            return { campaign: campaignOwnerView(row), duplicate: true };
          }
          assertFundingCampaignTransition(row.status, input.targetStatus);
          assertExpectedVersion(row.authorizationVersion, input.expectedAuthorizationVersion);
          if (input.targetStatus === "succeeded" && row.pledgedQuantity < row.goalQuantity) {
            throw new FundingCampaignServiceError("CAMPAIGN_GOAL_NOT_REACHED");
          }
          const now = new Date();
          await tx.update(fundingCampaigns).set({
            status: input.targetStatus,
            activeSourceDedupeKey: null,
            closedAt: now,
            authorizationVersion: row.authorizationVersion + 1,
            lastRequestId: requestId,
          }).where(eq(fundingCampaigns.id, row.id));
          await appendCampaignEvent(tx, {
            campaignId: row.id,
            eventType: "campaign_closed",
            actorAccountId: accountId,
            fromStatus: row.status,
            toStatus: input.targetStatus,
            requestId,
            detail: { reason, goalQuantity: row.goalQuantity, pledgedQuantity: row.pledgedQuantity },
            occurredAt: now,
          });
          const [updated] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, row.id)).limit(1);
          if (!updated) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { campaign: campaignOwnerView(updated), duplicate: false };
        });
      },
    });
  }

  async registerPledge(accountId: number, input: FundingPledgeRegisterInput) {
    const requestId = ensureRequestId(input.requestId);
    const publicCode = cleanText(input.publicCode, "CAMPAIGN_PUBLIC_CODE_INVALID", 32);
    const lookupDb = await requireDb();
    const [publicCampaign] = await lookupDb.select({ id: fundingCampaigns.id }).from(fundingCampaigns).where(and(
      eq(fundingCampaigns.publicCode, publicCode),
      eq(fundingCampaigns.visibility, "public"),
      isNull(fundingCampaigns.deletedAt),
    )).limit(1);
    if (!publicCampaign) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
    const campaignId = publicCampaign.id;
    return runAudited({
      accountId,
      action: "funding.pledge.register",
      resourceType: "funding_campaign",
      resourceId: campaignId,
      riskLevel: "sensitive",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.pledge.register",
          resourceType: "funding_campaign",
          resourceId: String(campaignId),
          purpose: "funding_pledge_register",
          requestId,
        });
        const quantity = positiveInteger(input.quantity, "PLEDGE_QUANTITY_INVALID", 1000);
        const note = optionalText(input.note, "PLEDGE_NOTE_INVALID", 2000) ?? null;
        const cityName = optionalText(input.cityName, "PLEDGE_CITY_INVALID", 100) ?? null;
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [campaign] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, campaignId)).for("update").limit(1);
          if (!campaign || campaign.deletedAt || campaign.visibility !== "public") throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
          if (campaign.ownerAccountId === accountId) throw new FundingCampaignServiceError("CAMPAIGN_SELF_PLEDGE_FORBIDDEN");
          const now = new Date();
          if (campaign.status !== "active" || (campaign.startsAt && campaign.startsAt > now) || !campaign.endsAt || campaign.endsAt <= now) {
            throw new FundingCampaignServiceError("CAMPAIGN_NOT_OPEN");
          }
          const [existingByRequest] = await tx.select().from(fundingPledges).where(eq(fundingPledges.requestId, requestId)).for("update").limit(1);
          if (existingByRequest) {
            if (existingByRequest.campaignId !== campaign.id || existingByRequest.supporterAccountId !== accountId || existingByRequest.quantity !== quantity) {
              throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            }
            return { pledge: existingByRequest, campaign: campaignPublicView(campaign), duplicate: true };
          }
          const dedupeKey = activePledgeKey(campaign.id, accountId);
          const [activeExisting] = await tx.select().from(fundingPledges).where(eq(fundingPledges.activeDedupeKey, dedupeKey)).for("update").limit(1);
          if (activeExisting) {
            if (activeExisting.quantity !== quantity) throw new FundingCampaignServiceError("PLEDGE_ALREADY_ACTIVE");
            return { pledge: activeExisting, campaign: campaignPublicView(campaign), duplicate: true };
          }
          const result = await tx.insert(fundingPledges).values({
            campaignId: campaign.id,
            supporterAccountId: accountId,
            quantity,
            note,
            cityName,
            status: "active",
            authorizationVersion: 1,
            activeDedupeKey: dedupeKey,
            requestId,
            lastRequestId: requestId,
          });
          const pledgeId = Number(result[0].insertId);
          const totals = await recalculatePledgeTotals(tx, campaign.id);
          await tx.update(fundingCampaigns).set({
            pledgedQuantity: totals.quantity,
            activePledgeCount: totals.count,
            authorizationVersion: campaign.authorizationVersion + 1,
            lastRequestId: requestId,
          }).where(eq(fundingCampaigns.id, campaign.id));
          await appendCampaignEvent(tx, {
            campaignId: campaign.id,
            eventType: "pledge_registered",
            actorAccountId: accountId,
            fromStatus: campaign.status,
            toStatus: campaign.status,
            pledgeId,
            requestId,
            detail: { quantity, pledgedQuantity: totals.quantity, activePledgeCount: totals.count },
            occurredAt: now,
          });
          const [pledge] = await tx.select().from(fundingPledges).where(eq(fundingPledges.id, pledgeId)).limit(1);
          const [updatedCampaign] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, campaign.id)).limit(1);
          if (!pledge || !updatedCampaign) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { pledge, campaign: campaignPublicView(updatedCampaign), duplicate: false };
        });
      },
    });
  }

  async withdrawPledge(accountId: number, input: FundingPledgeWithdrawInput) {
    const requestId = ensureRequestId(input.requestId);
    return runAudited({
      accountId,
      action: "funding.pledge.withdraw",
      resourceType: "funding_pledge",
      resourceId: input.pledgeId,
      riskLevel: "sensitive",
      requestId,
      operation: async () => {
        await requireAllowed(this.authorization, accountId, {
          capabilityCode: "funding.pledge.withdraw",
          resourceType: "funding_pledge",
          resourceId: String(input.pledgeId),
          purpose: "funding_pledge_withdraw",
          requestId,
        });
        const db = await requireDb();
        return db.transaction(async (tx) => {
          const [pledge] = await tx.select().from(fundingPledges).where(eq(fundingPledges.id, input.pledgeId)).for("update").limit(1);
          if (!pledge || pledge.supporterAccountId !== accountId) throw new FundingCampaignServiceError("PLEDGE_NOT_FOUND");
          if (pledge.status === "withdrawn") return { pledge, duplicate: true };
          const [campaign] = await tx.select().from(fundingCampaigns).where(eq(fundingCampaigns.id, pledge.campaignId)).for("update").limit(1);
          if (!campaign || campaign.status !== "active") throw new FundingCampaignServiceError("RESOURCE_STATE_FORBIDDEN");
          const [existingEvent] = await tx.select().from(fundingCampaignEvents).where(eq(fundingCampaignEvents.requestId, requestId)).limit(1);
          if (existingEvent) {
            if (existingEvent.pledgeId !== pledge.id || existingEvent.eventType !== "pledge_withdrawn") throw new FundingCampaignServiceError("IDEMPOTENCY_CONFLICT");
            return { pledge, duplicate: true };
          }
          const now = new Date();
          await tx.update(fundingPledges).set({
            status: "withdrawn",
            activeDedupeKey: null,
            lastRequestId: requestId,
            authorizationVersion: pledge.authorizationVersion + 1,
            withdrawnAt: now,
          }).where(eq(fundingPledges.id, pledge.id));
          const totals = await recalculatePledgeTotals(tx, campaign.id);
          await tx.update(fundingCampaigns).set({
            pledgedQuantity: totals.quantity,
            activePledgeCount: totals.count,
            authorizationVersion: campaign.authorizationVersion + 1,
            lastRequestId: requestId,
          }).where(eq(fundingCampaigns.id, campaign.id));
          await appendCampaignEvent(tx, {
            campaignId: campaign.id,
            eventType: "pledge_withdrawn",
            actorAccountId: accountId,
            fromStatus: campaign.status,
            toStatus: campaign.status,
            pledgeId: pledge.id,
            requestId,
            detail: { quantity: pledge.quantity, pledgedQuantity: totals.quantity, activePledgeCount: totals.count },
            occurredAt: now,
          });
          const [updated] = await tx.select().from(fundingPledges).where(eq(fundingPledges.id, pledge.id)).limit(1);
          if (!updated) throw new FundingCampaignServiceError("CONCURRENT_MODIFICATION");
          return { pledge: updated, duplicate: false };
        });
      },
    });
  }

  async listPublic(input: { limit?: number; cursor?: number; status?: FundingCampaignStatus; categoryCode?: string } = {}) {
    const db = await requireDb();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const statuses = input.status && PUBLIC_CAMPAIGN_STATUSES.includes(input.status) ? [input.status] : PUBLIC_CAMPAIGN_STATUSES;
    const conditions = [
      isNull(fundingCampaigns.deletedAt),
      eq(fundingCampaigns.visibility, "public" as const),
      inArray(fundingCampaigns.status, statuses),
    ];
    if (input.cursor) conditions.push(lt(fundingCampaigns.id, input.cursor));
    if (input.categoryCode?.trim()) conditions.push(eq(fundingCampaigns.categoryCode, input.categoryCode.trim()));
    const rows = await db.select().from(fundingCampaigns).where(and(...conditions))
      .orderBy(desc(fundingCampaigns.publishedAt), desc(fundingCampaigns.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(campaignPublicView),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async publicDetail(publicCode: string) {
    const code = cleanText(publicCode, "CAMPAIGN_PUBLIC_CODE_INVALID", 32);
    const db = await requireDb();
    const [row] = await db.select().from(fundingCampaigns).where(and(
      eq(fundingCampaigns.publicCode, code),
      eq(fundingCampaigns.visibility, "public"),
      inArray(fundingCampaigns.status, PUBLIC_CAMPAIGN_STATUSES),
      isNull(fundingCampaigns.deletedAt),
    )).limit(1);
    if (!row) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
    return campaignPublicView(row);
  }

  async publicTimeline(publicCode: string) {
    const code = cleanText(publicCode, "CAMPAIGN_PUBLIC_CODE_INVALID", 32);
    const db = await requireDb();
    const [campaign] = await db.select({ id: fundingCampaigns.id }).from(fundingCampaigns).where(and(
      eq(fundingCampaigns.publicCode, code),
      eq(fundingCampaigns.visibility, "public"),
      inArray(fundingCampaigns.status, PUBLIC_CAMPAIGN_STATUSES),
      isNull(fundingCampaigns.deletedAt),
    )).limit(1);
    if (!campaign) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
    const rows = await db.select({
      sequenceNumber: fundingCampaignEvents.sequenceNumber,
      eventType: fundingCampaignEvents.eventType,
      fromStatus: fundingCampaignEvents.fromStatus,
      toStatus: fundingCampaignEvents.toStatus,
      detail: fundingCampaignEvents.detail,
      occurredAt: fundingCampaignEvents.occurredAt,
    }).from(fundingCampaignEvents).where(eq(fundingCampaignEvents.campaignId, campaign.id))
      .orderBy(desc(fundingCampaignEvents.sequenceNumber));
    return rows.map((row) => ({
      sequenceNumber: row.sequenceNumber,
      eventType: row.eventType,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      detail: row.detail,
      occurredAt: row.occurredAt,
    }));
  }

  async listMine(accountId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "funding.campaign.view_owner",
      purpose: "funding_campaign_list_mine",
    });
    const db = await requireDb();
    const rows = await db.select().from(fundingCampaigns).where(and(
      eq(fundingCampaigns.ownerAccountId, accountId),
      isNull(fundingCampaigns.deletedAt),
    )).orderBy(desc(fundingCampaigns.updatedAt), desc(fundingCampaigns.id));
    return rows.map(campaignOwnerView);
  }

  async ownerDetail(accountId: number, campaignId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "funding.campaign.view_owner",
      resourceType: "funding_campaign",
      resourceId: String(campaignId),
      purpose: "funding_campaign_owner_detail",
    });
    const db = await requireDb();
    const [row] = await db.select().from(fundingCampaigns).where(and(
      eq(fundingCampaigns.id, campaignId),
      eq(fundingCampaigns.ownerAccountId, accountId),
      isNull(fundingCampaigns.deletedAt),
    )).limit(1);
    if (!row) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
    return campaignOwnerView(row);
  }

  async listMyPledges(accountId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "funding.pledge.view_self",
      purpose: "funding_pledge_list_self",
    });
    const db = await requireDb();
    return db.select({
      id: fundingPledges.id,
      campaignPublicCode: fundingCampaigns.publicCode,
      campaignTitle: fundingCampaigns.title,
      campaignStatus: fundingCampaigns.status,
      quantity: fundingPledges.quantity,
      note: fundingPledges.note,
      cityName: fundingPledges.cityName,
      status: fundingPledges.status,
      createdAt: fundingPledges.createdAt,
      updatedAt: fundingPledges.updatedAt,
      withdrawnAt: fundingPledges.withdrawnAt,
    }).from(fundingPledges).innerJoin(fundingCampaigns, eq(fundingCampaigns.id, fundingPledges.campaignId))
      .where(eq(fundingPledges.supporterAccountId, accountId))
      .orderBy(desc(fundingPledges.updatedAt), desc(fundingPledges.id));
  }

  async listCampaignPledges(accountId: number, campaignId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "funding.pledge.view_campaign",
      resourceType: "funding_campaign",
      resourceId: String(campaignId),
      purpose: "funding_pledge_list_campaign",
    });
    const db = await requireDb();
    const [campaign] = await db.select({ ownerAccountId: fundingCampaigns.ownerAccountId }).from(fundingCampaigns)
      .where(and(eq(fundingCampaigns.id, campaignId), isNull(fundingCampaigns.deletedAt))).limit(1);
    if (!campaign || campaign.ownerAccountId !== accountId) throw new FundingCampaignServiceError("CAMPAIGN_NOT_FOUND");
    const rows = await db.select({
      quantity: fundingPledges.quantity,
      note: fundingPledges.note,
      cityName: fundingPledges.cityName,
      status: fundingPledges.status,
      createdAt: fundingPledges.createdAt,
      displayName: userProfiles.nickname,
      avatarUrl: userProfiles.avatarUrl,
      profileCityName: userProfiles.cityName,
      accountName: users.name,
    }).from(fundingPledges)
      .innerJoin(users, eq(users.id, fundingPledges.supporterAccountId))
      .leftJoin(userProfiles, eq(userProfiles.userId, fundingPledges.supporterAccountId))
      .where(and(eq(fundingPledges.campaignId, campaignId), eq(fundingPledges.status, "active")))
      .orderBy(desc(fundingPledges.createdAt), desc(fundingPledges.id));
    return rows.map((row) => ({
      quantity: row.quantity,
      note: row.note,
      cityName: row.cityName ?? row.profileCityName,
      status: row.status,
      createdAt: row.createdAt,
      displayName: row.displayName?.trim() || row.accountName?.trim() || "用户",
      avatarUrl: row.avatarUrl,
    }));
  }
}

export const fundingCampaignService = new FundingCampaignService();
