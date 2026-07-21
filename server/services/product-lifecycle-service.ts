import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import {
  ideas,
  items,
  needs,
  organizationMemberships,
  productModels,
  productPassportEvents,
  productSourceLinks,
  productUnits,
  projectMemberships,
  projects,
  users,
} from "../../drizzle/schema";
import { getAuthorizationService } from "../authorization";
import type { AuthorizationRequest, AuthorizationResult } from "../authorization";
import { requireDb } from "../db";
import { writeAudit } from "./audit-service";

export type ProductModelVisibility = "public" | "owner_only" | "restricted";
export type ProductModelStatus = "draft" | "active" | "retired" | "archived";
export type ProductSourceType = "need" | "idea" | "project" | "legacy_item";
export type ProductSourceRelation = "derived_from" | "validated_by" | "produced_by" | "migrated_from";
export type ProductUnitStatus =
  | "registered"
  | "manufactured"
  | "in_use"
  | "idle"
  | "listed"
  | "under_service"
  | "transferred"
  | "recycling"
  | "recycled"
  | "retired";
export type ProductTrustLevel = "self_declared" | "verified" | "certified";
export type ProductPassportVisibility = "public" | "owner" | "internal";

export class ProductLifecycleServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProductLifecycleServiceError";
  }
}

export interface ProductAuthorizationPort {
  authorize(accountId: number, request: Omit<AuthorizationRequest, "accountId">): Promise<AuthorizationResult>;
}

const runtimeAuthorization: ProductAuthorizationPort = {
  authorize: (accountId, request) => getAuthorizationService().authorize({ accountId, ...request }),
};

export interface ProductSourceLinkInput {
  sourceType: ProductSourceType;
  sourceId: number;
  relationType?: ProductSourceRelation;
}

export interface ProductModelCreateInput {
  name: string;
  summary: string;
  description?: string;
  categoryCode: string;
  brandName?: string;
  modelCode?: string;
  versionLabel?: string;
  specifications?: Record<string, unknown>;
  visibility?: ProductModelVisibility;
  ownerOrganizationId?: number;
  sourceLinks?: ProductSourceLinkInput[];
  requestId: string;
}

export interface ProductModelUpdateInput {
  productModelId: number;
  name?: string;
  summary?: string;
  description?: string | null;
  categoryCode?: string;
  brandName?: string | null;
  modelCode?: string | null;
  versionLabel?: string;
  specifications?: Record<string, unknown>;
  visibility?: ProductModelVisibility;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProductModelActionInput {
  productModelId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProductSourceLinkCreateInput extends ProductSourceLinkInput {
  productModelId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProductUnitRegisterInput {
  productModelId: number;
  linkedItemId?: number;
  serialNumber?: string;
  batchCode?: string;
  initialStatus?: "registered" | "manufactured";
  trustLevel?: ProductTrustLevel;
  passportVisibility?: "public" | "owner_only" | "restricted";
  manufacturedAt?: Date;
  detail?: Record<string, unknown>;
  requestId: string;
}

export interface ProductUnitLinkItemInput {
  productUnitId: number;
  linkedItemId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProductUnitTransitionInput {
  productUnitId: number;
  toStatus: ProductUnitStatus;
  nextOwnerAccountId?: number;
  visibility?: ProductPassportVisibility;
  sourceType?: string;
  sourceId?: string;
  detail?: Record<string, unknown>;
  occurredAt?: Date;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProductPassportAppendInput {
  productUnitId: number;
  eventType: string;
  visibility?: ProductPassportVisibility;
  sourceType?: string;
  sourceId?: string;
  detail?: Record<string, unknown>;
  occurredAt?: Date;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

const PRODUCT_UNIT_TRANSITIONS: Readonly<Record<ProductUnitStatus, ReadonlySet<ProductUnitStatus>>> = {
  registered: new Set(["manufactured", "retired"]),
  manufactured: new Set(["in_use", "idle", "retired"]),
  in_use: new Set(["idle", "listed", "under_service", "recycling", "retired"]),
  idle: new Set(["in_use", "listed", "under_service", "recycling", "retired"]),
  listed: new Set(["in_use", "idle", "transferred", "under_service", "recycling"]),
  under_service: new Set(["in_use", "idle", "retired"]),
  transferred: new Set(["in_use", "idle", "listed", "under_service", "recycling", "retired"]),
  recycling: new Set(["idle", "recycled"]),
  recycled: new Set(["retired"]),
  retired: new Set(),
};

const PASSPORT_EVENT_VISIBILITIES = new Set<ProductPassportVisibility>(["public", "owner", "internal"]);

function ensureRequestId(value: string): string {
  const result = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(result)) throw new ProductLifecycleServiceError("REQUEST_ID_INVALID");
  return result;
}

function cleanText(value: string, code: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new ProductLifecycleServiceError(code);
  return result;
}

function optionalText(value: string | null | undefined, code: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = value.trim();
  if (!result) return null;
  if (result.length > max) throw new ProductLifecycleServiceError(code);
  return result;
}

function normalizeJsonObject(value: Record<string, unknown> | undefined, code: string, maxBytes: number): Record<string, unknown> {
  const result = value ?? {};
  if (Array.isArray(result) || result === null || typeof result !== "object") throw new ProductLifecycleServiceError(code);
  let serialized = "";
  try {
    serialized = canonicalJson(result);
  } catch {
    throw new ProductLifecycleServiceError(code);
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw new ProductLifecycleServiceError(code);
  return JSON.parse(serialized) as Record<string, unknown>;
}

function assertExpectedVersion(current: number, expected?: number): void {
  if (expected != null && current !== expected) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
}

export function assertProductUnitTransition(fromStatus: ProductUnitStatus, toStatus: ProductUnitStatus): void {
  if (fromStatus === toStatus) return;
  if (!PRODUCT_UNIT_TRANSITIONS[fromStatus]?.has(toStatus)) {
    throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
  }
}

function normalizeCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeCanonicalValue(nested)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ProductLifecycleServiceError("PASSPORT_DETAIL_INVALID");
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export interface ProductPassportHashInput {
  productUnitId: number;
  sequenceNumber: number;
  eventType: string;
  actorAccountId: number | null;
  actorOrganizationId: number | null;
  fromStatus: string | null;
  toStatus: string | null;
  visibility: ProductPassportVisibility;
  sourceType: string | null;
  sourceId: string | null;
  requestId: string;
  detail: Record<string, unknown>;
  previousEventHash: string | null;
  occurredAt: Date;
}

export function productPassportEventHash(input: ProductPassportHashInput): string {
  return createHash("sha256").update(canonicalJson({
    productUnitId: input.productUnitId,
    sequenceNumber: input.sequenceNumber,
    eventType: input.eventType,
    actorAccountId: input.actorAccountId,
    actorOrganizationId: input.actorOrganizationId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    visibility: input.visibility,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    requestId: input.requestId,
    detail: input.detail,
    previousEventHash: input.previousEventHash,
    occurredAt: input.occurredAt.toISOString(),
  }), "utf8").digest("hex");
}

function modelPublicCode(): string {
  return `PM-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

function unitPublicCode(): string {
  return `PU-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
}

function derivedRequestId(requestId: string, purpose: string, index = 0): string {
  return `${purpose}:${createHash("sha256").update(`${requestId}:${purpose}:${index}`, "utf8").digest("hex").slice(0, 40)}`;
}

async function requireAllowed(
  authorization: ProductAuthorizationPort,
  accountId: number,
  request: Omit<AuthorizationRequest, "accountId">,
): Promise<AuthorizationResult> {
  const result = await authorization.authorize(accountId, request);
  if (!result.allowed) throw new ProductLifecycleServiceError(result.reasonCode);
  return result;
}

function productModelView(row: typeof productModels.$inferSelect) {
  return {
    id: row.id,
    publicCode: row.publicCode,
    ownerAccountId: row.ownerAccountId,
    ownerOrganizationId: row.ownerOrganizationId,
    name: row.name,
    summary: row.summary,
    description: row.description,
    categoryCode: row.categoryCode,
    brandName: row.brandName,
    modelCode: row.modelCode,
    versionLabel: row.versionLabel,
    specifications: row.specifications,
    visibility: row.visibility,
    status: row.status,
    authorizationVersion: row.authorizationVersion,
    publishedAt: row.publishedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicProductModelView(row: typeof productModels.$inferSelect) {
  return {
    publicCode: row.publicCode,
    name: row.name,
    summary: row.summary,
    description: row.description,
    categoryCode: row.categoryCode,
    brandName: row.brandName,
    modelCode: row.modelCode,
    versionLabel: row.versionLabel,
    specifications: row.specifications,
    status: row.status,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

function productUnitView(row: typeof productUnits.$inferSelect) {
  return {
    id: row.id,
    productModelId: row.productModelId,
    linkedItemId: row.linkedItemId,
    currentOwnerAccountId: row.currentOwnerAccountId,
    publicCode: row.publicCode,
    serialNumber: row.serialNumber,
    batchCode: row.batchCode,
    status: row.status,
    trustLevel: row.trustLevel,
    passportVisibility: row.passportVisibility,
    authorizationVersion: row.authorizationVersion,
    manufacturedAt: row.manufacturedAt,
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function publicProductUnitView(row: typeof productUnits.$inferSelect) {
  return {
    publicCode: row.publicCode,
    status: row.status,
    trustLevel: row.trustLevel,
    manufacturedAt: row.manufacturedAt,
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function passportEventView(row: typeof productPassportEvents.$inferSelect) {
  return {
    id: row.id,
    productUnitId: row.productUnitId,
    sequenceNumber: row.sequenceNumber,
    eventType: row.eventType,
    actorAccountId: row.actorAccountId,
    actorOrganizationId: row.actorOrganizationId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    visibility: row.visibility,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    detail: row.detail,
    previousEventHash: row.previousEventHash,
    eventHash: row.eventHash,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function publicPassportEventView(row: typeof productPassportEvents.$inferSelect) {
  return {
    sequenceNumber: row.sequenceNumber,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    detail: row.detail,
    previousEventHash: row.previousEventHash,
    eventHash: row.eventHash,
    occurredAt: row.occurredAt,
  };
}

type ProductDatabase = Awaited<ReturnType<typeof requireDb>>;
type ProductTransaction = Parameters<Parameters<ProductDatabase["transaction"]>[0]>[0];

async function sourceAccessible(
  tx: ProductTransaction,
  accountId: number,
  sourceType: ProductSourceType,
  sourceId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return false;
  if (sourceType === "need") {
    const [row] = await tx.select({ creatorId: needs.creatorId, visibility: needs.visibility })
      .from(needs).where(eq(needs.id, sourceId)).limit(1);
    return Boolean(row && (row.creatorId === accountId || row.visibility === "public"));
  }
  if (sourceType === "idea") {
    const [row] = await tx.select({ creatorAccountId: ideas.creatorAccountId, visibility: ideas.visibility, status: ideas.status, deletedAt: ideas.deletedAt })
      .from(ideas).where(eq(ideas.id, sourceId)).limit(1);
    return Boolean(row && !row.deletedAt && (row.creatorAccountId === accountId || (row.visibility === "public" && ["published", "collaborating", "converted"].includes(row.status))));
  }
  if (sourceType === "project") {
    const [row] = await tx.select({ ownerId: projects.ownerId, engineerId: projects.engineerId }).from(projects).where(eq(projects.id, sourceId)).limit(1);
    if (!row) return false;
    if (row.ownerId === accountId || row.engineerId === accountId) return true;
    const [membership] = await tx.select({ id: projectMemberships.id }).from(projectMemberships).where(and(
      eq(projectMemberships.projectId, sourceId),
      eq(projectMemberships.accountId, accountId),
      eq(projectMemberships.status, "active"),
    )).limit(1);
    return Boolean(membership);
  }
  const [row] = await tx.select({ ownerId: items.ownerId }).from(items).where(eq(items.id, sourceId)).limit(1);
  return row?.ownerId === accountId;
}

async function appendPassportEvent(
  tx: ProductTransaction,
  input: ProductPassportHashInput,
): Promise<{ event: ReturnType<typeof passportEventView>; duplicate: boolean }> {
  const [existing] = await tx.select().from(productPassportEvents).where(eq(productPassportEvents.requestId, input.requestId)).limit(1);
  if (existing) {
    if (existing.productUnitId !== input.productUnitId || existing.eventType !== input.eventType) {
      throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
    }
    return { event: passportEventView(existing), duplicate: true };
  }
  const [last] = await tx.select().from(productPassportEvents)
    .where(eq(productPassportEvents.productUnitId, input.productUnitId))
    .orderBy(desc(productPassportEvents.sequenceNumber))
    .limit(1);
  const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;
  const previousEventHash = last?.eventHash ?? null;
  const hashInput = { ...input, sequenceNumber, previousEventHash };
  const eventHash = productPassportEventHash(hashInput);
  const result = await tx.insert(productPassportEvents).values({
    productUnitId: input.productUnitId,
    sequenceNumber,
    eventType: input.eventType,
    actorAccountId: input.actorAccountId,
    actorOrganizationId: input.actorOrganizationId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    visibility: input.visibility,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    requestId: input.requestId,
    detail: input.detail,
    previousEventHash,
    eventHash,
    occurredAt: input.occurredAt,
  });
  const [created] = await tx.select().from(productPassportEvents)
    .where(eq(productPassportEvents.id, Number(result[0].insertId))).limit(1);
  if (!created) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
  return { event: passportEventView(created), duplicate: false };
}

async function auditSafely(input: Parameters<typeof writeAudit>[0]): Promise<void> {
  try {
    await writeAudit(input);
  } catch {
    // Business state remains authoritative if the secondary compatibility audit writer is unavailable.
  }
}

export class ProductLifecycleService {
  constructor(private readonly authorization: ProductAuthorizationPort = runtimeAuthorization) {}

  async createModel(accountId: number, input: ProductModelCreateInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.model.create",
      organizationId: input.ownerOrganizationId,
      purpose: "product_model_create",
      requestId,
    });
    const values = {
      name: cleanText(input.name, "PRODUCT_NAME_INVALID", 160),
      summary: cleanText(input.summary, "PRODUCT_SUMMARY_INVALID", 500),
      description: optionalText(input.description, "PRODUCT_DESCRIPTION_INVALID", 20_000) ?? null,
      categoryCode: cleanText(input.categoryCode, "PRODUCT_CATEGORY_INVALID", 64),
      brandName: optionalText(input.brandName, "PRODUCT_BRAND_INVALID", 128) ?? null,
      modelCode: optionalText(input.modelCode, "PRODUCT_MODEL_CODE_INVALID", 128) ?? null,
      versionLabel: cleanText(input.versionLabel ?? "v1", "PRODUCT_VERSION_INVALID", 64),
      specifications: normalizeJsonObject(input.specifications, "PRODUCT_SPECIFICATIONS_INVALID", 32_000),
      visibility: input.visibility ?? "owner_only",
    };
    const dedupedSources = [...new Map((input.sourceLinks ?? []).map((source) => [
      `${source.sourceType}:${source.sourceId}:${source.relationType ?? "derived_from"}`,
      { ...source, relationType: source.relationType ?? "derived_from" as ProductSourceRelation },
    ])).values()];
    if (dedupedSources.length > 20) throw new ProductLifecycleServiceError("PRODUCT_SOURCE_LIMIT_EXCEEDED");
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productModels).where(or(
        eq(productModels.createdRequestId, requestId),
        eq(productModels.lastRequestId, requestId),
      )).limit(1);
      if (existing) {
        if (existing.ownerAccountId !== accountId) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
        const links = await tx.select().from(productSourceLinks).where(eq(productSourceLinks.productModelId, existing.id)).orderBy(asc(productSourceLinks.id));
        return { model: productModelView(existing), sourceLinks: links, duplicate: true };
      }
      if (input.ownerOrganizationId != null) {
        const [membership] = await tx.select({ id: organizationMemberships.id }).from(organizationMemberships).where(and(
          eq(organizationMemberships.organizationId, input.ownerOrganizationId),
          eq(organizationMemberships.accountId, accountId),
          eq(organizationMemberships.status, "active"),
        )).limit(1);
        if (!membership) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      }
      for (const source of dedupedSources) {
        if (!await sourceAccessible(tx, accountId, source.sourceType, source.sourceId)) {
          throw new ProductLifecycleServiceError("PRODUCT_SOURCE_INACCESSIBLE");
        }
      }
      const inserted = await tx.insert(productModels).values({
        publicCode: modelPublicCode(),
        ownerAccountId: accountId,
        ownerOrganizationId: input.ownerOrganizationId ?? null,
        ...values,
        status: "draft",
        authorizationVersion: 1,
        createdRequestId: requestId,
        lastRequestId: requestId,
      });
      const productModelId = Number(inserted[0].insertId);
      for (const [index, source] of dedupedSources.entries()) {
        await tx.insert(productSourceLinks).values({
          productModelId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          relationType: source.relationType,
          createdByAccountId: accountId,
          requestId: derivedRequestId(requestId, "psl", index),
        });
      }
      const [created] = await tx.select().from(productModels).where(eq(productModels.id, productModelId)).limit(1);
      if (!created) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      const links = await tx.select().from(productSourceLinks).where(eq(productSourceLinks.productModelId, productModelId)).orderBy(asc(productSourceLinks.id));
      return { model: productModelView(created), sourceLinks: links, duplicate: false };
    });
    await auditSafely({
      actorId: accountId,
      actorRole: "user",
      action: "product.model.create",
      resourceType: "product_model",
      resourceId: result.model.id,
      result: "success",
      riskLevel: "sensitive",
      detail: { requestId, duplicate: result.duplicate, status: result.model.status },
    });
    return result;
  }

  async updateModel(accountId: number, input: ProductModelUpdateInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.model.edit",
      resourceType: "product_model",
      resourceId: String(input.productModelId),
      purpose: "product_model_update",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(productModels).where(and(
        eq(productModels.id, input.productModelId),
        isNull(productModels.deletedAt),
      )).for("update").limit(1);
      if (!current || current.ownerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      if (!["draft", "active"].includes(current.status)) throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
      if (current.lastRequestId === requestId) return { model: productModelView(current), duplicate: true };
      const [requestOwner] = await tx.select({ id: productModels.id }).from(productModels).where(or(
        eq(productModels.createdRequestId, requestId),
        eq(productModels.lastRequestId, requestId),
      )).limit(1);
      if (requestOwner && requestOwner.id !== current.id) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
      assertExpectedVersion(current.authorizationVersion, input.expectedAuthorizationVersion);
      await tx.update(productModels).set({
        ...(input.name !== undefined ? { name: cleanText(input.name, "PRODUCT_NAME_INVALID", 160) } : {}),
        ...(input.summary !== undefined ? { summary: cleanText(input.summary, "PRODUCT_SUMMARY_INVALID", 500) } : {}),
        ...(input.description !== undefined ? { description: optionalText(input.description, "PRODUCT_DESCRIPTION_INVALID", 20_000) ?? null } : {}),
        ...(input.categoryCode !== undefined ? { categoryCode: cleanText(input.categoryCode, "PRODUCT_CATEGORY_INVALID", 64) } : {}),
        ...(input.brandName !== undefined ? { brandName: optionalText(input.brandName, "PRODUCT_BRAND_INVALID", 128) ?? null } : {}),
        ...(input.modelCode !== undefined ? { modelCode: optionalText(input.modelCode, "PRODUCT_MODEL_CODE_INVALID", 128) ?? null } : {}),
        ...(input.versionLabel !== undefined ? { versionLabel: cleanText(input.versionLabel, "PRODUCT_VERSION_INVALID", 64) } : {}),
        ...(input.specifications !== undefined ? { specifications: normalizeJsonObject(input.specifications, "PRODUCT_SPECIFICATIONS_INVALID", 32_000) } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        authorizationVersion: current.authorizationVersion + 1,
        lastRequestId: requestId,
      }).where(and(eq(productModels.id, current.id), eq(productModels.authorizationVersion, current.authorizationVersion)));
      const [updated] = await tx.select().from(productModels).where(eq(productModels.id, current.id)).limit(1);
      if (!updated || updated.authorizationVersion !== current.authorizationVersion + 1) {
        throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      }
      return { model: productModelView(updated), duplicate: false };
    });
  }

  async publishModel(accountId: number, input: ProductModelActionInput) {
    return this.transitionModel(accountId, input, "active", "product.model.publish");
  }

  async retireModel(accountId: number, input: ProductModelActionInput) {
    return this.transitionModel(accountId, input, "retired", "product.model.retire");
  }

  private async transitionModel(
    accountId: number,
    input: ProductModelActionInput,
    toStatus: "active" | "retired",
    capabilityCode: "product.model.publish" | "product.model.retire",
  ) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode,
      resourceType: "product_model",
      resourceId: String(input.productModelId),
      purpose: capabilityCode.replaceAll(".", "_"),
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(productModels).where(and(
        eq(productModels.id, input.productModelId),
        isNull(productModels.deletedAt),
      )).for("update").limit(1);
      if (!current || current.ownerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      if (current.lastRequestId === requestId) return { model: productModelView(current), duplicate: true, noOp: false };
      if (current.status === toStatus) return { model: productModelView(current), duplicate: false, noOp: true };
      if (toStatus === "active" && current.status !== "draft") throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
      if (toStatus === "retired" && current.status !== "active") throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
      assertExpectedVersion(current.authorizationVersion, input.expectedAuthorizationVersion);
      await tx.update(productModels).set({
        status: toStatus,
        authorizationVersion: current.authorizationVersion + 1,
        lastRequestId: requestId,
        ...(toStatus === "active" ? { publishedAt: new Date(), retiredAt: null } : { retiredAt: new Date() }),
      }).where(and(eq(productModels.id, current.id), eq(productModels.authorizationVersion, current.authorizationVersion)));
      const [updated] = await tx.select().from(productModels).where(eq(productModels.id, current.id)).limit(1);
      if (!updated || updated.authorizationVersion !== current.authorizationVersion + 1) {
        throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      }
      return { model: productModelView(updated), duplicate: false, noOp: false };
    });
    await auditSafely({
      actorId: accountId,
      actorRole: "user",
      action: capabilityCode,
      resourceType: "product_model",
      resourceId: input.productModelId,
      result: "success",
      riskLevel: "high",
      detail: { requestId, toStatus, duplicate: result.duplicate, noOp: result.noOp },
    });
    return result;
  }

  async addSourceLink(accountId: number, input: ProductSourceLinkCreateInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.model.edit",
      resourceType: "product_model",
      resourceId: String(input.productModelId),
      purpose: "product_source_link_create",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productSourceLinks).where(eq(productSourceLinks.requestId, requestId)).limit(1);
      if (existing) {
        if (existing.productModelId !== input.productModelId) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
        return { sourceLink: existing, duplicate: true };
      }
      const [model] = await tx.select().from(productModels).where(and(
        eq(productModels.id, input.productModelId),
        isNull(productModels.deletedAt),
      )).for("update").limit(1);
      if (!model || model.ownerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      if (!["draft", "active"].includes(model.status)) throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
      assertExpectedVersion(model.authorizationVersion, input.expectedAuthorizationVersion);
      if (!await sourceAccessible(tx, accountId, input.sourceType, input.sourceId)) {
        throw new ProductLifecycleServiceError("PRODUCT_SOURCE_INACCESSIBLE");
      }
      const [sameRelation] = await tx.select().from(productSourceLinks).where(and(
        eq(productSourceLinks.productModelId, input.productModelId),
        eq(productSourceLinks.sourceType, input.sourceType),
        eq(productSourceLinks.sourceId, input.sourceId),
        eq(productSourceLinks.relationType, input.relationType ?? "derived_from"),
      )).limit(1);
      if (sameRelation) return { sourceLink: sameRelation, duplicate: false, noOp: true };
      const inserted = await tx.insert(productSourceLinks).values({
        productModelId: input.productModelId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        relationType: input.relationType ?? "derived_from",
        createdByAccountId: accountId,
        requestId,
      });
      await tx.update(productModels).set({
        authorizationVersion: model.authorizationVersion + 1,
        lastRequestId: requestId,
      }).where(and(eq(productModels.id, model.id), eq(productModels.authorizationVersion, model.authorizationVersion)));
      const [created] = await tx.select().from(productSourceLinks).where(eq(productSourceLinks.id, Number(inserted[0].insertId))).limit(1);
      if (!created) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      return { sourceLink: created, duplicate: false, noOp: false };
    });
  }

  async registerUnit(accountId: number, input: ProductUnitRegisterInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.unit.register",
      resourceType: "product_model",
      resourceId: String(input.productModelId),
      purpose: "product_unit_register",
      requestId,
    });
    const detail = normalizeJsonObject(input.detail, "PASSPORT_DETAIL_INVALID", 32_000);
    const initialStatus = input.initialStatus ?? (input.manufacturedAt ? "manufactured" : "registered");
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productUnits).where(or(
        eq(productUnits.createdRequestId, requestId),
        eq(productUnits.lastRequestId, requestId),
      )).limit(1);
      if (existing) {
        if (existing.productModelId !== input.productModelId) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
        const [event] = await tx.select().from(productPassportEvents).where(eq(productPassportEvents.requestId, requestId)).limit(1);
        return { unit: productUnitView(existing), event: event ? passportEventView(event) : null, duplicate: true };
      }
      const [model] = await tx.select().from(productModels).where(and(
        eq(productModels.id, input.productModelId),
        isNull(productModels.deletedAt),
      )).for("update").limit(1);
      if (!model || model.ownerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      if (model.status !== "active") throw new ProductLifecycleServiceError("RESOURCE_STATE_FORBIDDEN");
      if (input.linkedItemId != null) {
        const [item] = await tx.select({ ownerId: items.ownerId }).from(items).where(eq(items.id, input.linkedItemId)).for("update").limit(1);
        if (!item || item.ownerId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
        const [alreadyLinked] = await tx.select({ id: productUnits.id }).from(productUnits).where(eq(productUnits.linkedItemId, input.linkedItemId)).limit(1);
        if (alreadyLinked) throw new ProductLifecycleServiceError("PRODUCT_ITEM_ALREADY_LINKED");
      }
      const inserted = await tx.insert(productUnits).values({
        productModelId: input.productModelId,
        linkedItemId: input.linkedItemId ?? null,
        currentOwnerAccountId: accountId,
        publicCode: unitPublicCode(),
        serialNumber: optionalText(input.serialNumber, "PRODUCT_SERIAL_INVALID", 128) ?? null,
        batchCode: optionalText(input.batchCode, "PRODUCT_BATCH_INVALID", 96) ?? null,
        status: initialStatus,
        trustLevel: input.trustLevel ?? "self_declared",
        passportVisibility: input.passportVisibility ?? "owner_only",
        authorizationVersion: 1,
        createdRequestId: requestId,
        lastRequestId: requestId,
        manufacturedAt: input.manufacturedAt ?? null,
        activatedAt: null,
      });
      const productUnitId = Number(inserted[0].insertId);
      const appended = await appendPassportEvent(tx, {
        productUnitId,
        sequenceNumber: 0,
        eventType: initialStatus === "manufactured" ? "product_manufactured" : "product_registered",
        actorAccountId: accountId,
        actorOrganizationId: model.ownerOrganizationId,
        fromStatus: null,
        toStatus: initialStatus,
        visibility: input.passportVisibility === "public" ? "public" : "owner",
        sourceType: input.linkedItemId != null ? "legacy_item" : null,
        sourceId: input.linkedItemId != null ? String(input.linkedItemId) : null,
        requestId,
        detail,
        previousEventHash: null,
        occurredAt: input.manufacturedAt ?? new Date(),
      });
      const [created] = await tx.select().from(productUnits).where(eq(productUnits.id, productUnitId)).limit(1);
      if (!created) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      return { unit: productUnitView(created), event: appended.event, duplicate: false };
    });
    await auditSafely({
      actorId: accountId,
      actorRole: "user",
      action: "product.unit.register",
      resourceType: "product_unit",
      resourceId: result.unit.id,
      result: "success",
      riskLevel: "high",
      detail: { requestId, duplicate: result.duplicate, productModelId: input.productModelId },
    });
    return result;
  }

  async linkUnitItem(accountId: number, input: ProductUnitLinkItemInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.unit.link_item",
      resourceType: "product_unit",
      resourceId: String(input.productUnitId),
      purpose: "product_unit_link_item",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [unit] = await tx.select().from(productUnits).where(eq(productUnits.id, input.productUnitId)).for("update").limit(1);
      if (!unit || unit.currentOwnerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      if (unit.lastRequestId === requestId) return { unit: productUnitView(unit), duplicate: true, noOp: false };
      if (unit.linkedItemId === input.linkedItemId) return { unit: productUnitView(unit), duplicate: false, noOp: true };
      if (unit.linkedItemId != null) throw new ProductLifecycleServiceError("PRODUCT_ITEM_ALREADY_LINKED");
      assertExpectedVersion(unit.authorizationVersion, input.expectedAuthorizationVersion);
      const [item] = await tx.select({ ownerId: items.ownerId }).from(items).where(eq(items.id, input.linkedItemId)).for("update").limit(1);
      if (!item || item.ownerId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      const [alreadyLinked] = await tx.select({ id: productUnits.id }).from(productUnits).where(eq(productUnits.linkedItemId, input.linkedItemId)).limit(1);
      if (alreadyLinked) throw new ProductLifecycleServiceError("PRODUCT_ITEM_ALREADY_LINKED");
      await tx.update(productUnits).set({
        linkedItemId: input.linkedItemId,
        currentOwnerAccountId: accountId,
        authorizationVersion: unit.authorizationVersion + 1,
        lastRequestId: requestId,
      }).where(and(eq(productUnits.id, unit.id), eq(productUnits.authorizationVersion, unit.authorizationVersion)));
      await appendPassportEvent(tx, {
        productUnitId: unit.id,
        sequenceNumber: 0,
        eventType: "legacy_item_linked",
        actorAccountId: accountId,
        actorOrganizationId: null,
        fromStatus: unit.status,
        toStatus: unit.status,
        visibility: "owner",
        sourceType: "legacy_item",
        sourceId: String(input.linkedItemId),
        requestId,
        detail: { linkedItemId: input.linkedItemId },
        previousEventHash: null,
        occurredAt: new Date(),
      });
      const [updated] = await tx.select().from(productUnits).where(eq(productUnits.id, unit.id)).limit(1);
      if (!updated || updated.authorizationVersion !== unit.authorizationVersion + 1) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      return { unit: productUnitView(updated), duplicate: false, noOp: false };
    });
  }

  async transitionUnit(accountId: number, input: ProductUnitTransitionInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.unit.transition",
      resourceType: "product_unit",
      resourceId: String(input.productUnitId),
      purpose: "product_unit_transition",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const detail = normalizeJsonObject(input.detail, "PASSPORT_DETAIL_INVALID", 32_000);
    const visibility = input.visibility ?? "owner";
    if (!PASSPORT_EVENT_VISIBILITIES.has(visibility)) throw new ProductLifecycleServiceError("PASSPORT_VISIBILITY_INVALID");
    if (input.toStatus === "transferred" && !input.nextOwnerAccountId) throw new ProductLifecycleServiceError("NEXT_OWNER_REQUIRED");
    if (input.toStatus !== "transferred" && input.nextOwnerAccountId != null) throw new ProductLifecycleServiceError("NEXT_OWNER_NOT_ALLOWED");
    const occurredAt = input.occurredAt ?? new Date();
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const [unit] = await tx.select().from(productUnits).where(eq(productUnits.id, input.productUnitId)).for("update").limit(1);
      if (!unit || unit.currentOwnerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      const [existingEvent] = await tx.select().from(productPassportEvents).where(eq(productPassportEvents.requestId, requestId)).limit(1);
      if (existingEvent) {
        if (existingEvent.productUnitId !== unit.id || existingEvent.toStatus !== input.toStatus) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
        return { unit: productUnitView(unit), event: passportEventView(existingEvent), duplicate: true, noOp: false };
      }
      if (unit.status === input.toStatus) return { unit: productUnitView(unit), event: null, duplicate: false, noOp: true };
      assertExpectedVersion(unit.authorizationVersion, input.expectedAuthorizationVersion);
      assertProductUnitTransition(unit.status, input.toStatus);
      if (input.nextOwnerAccountId != null) {
        const [nextOwner] = await tx.select({ id: users.id, accountStatus: users.accountStatus }).from(users)
          .where(eq(users.id, input.nextOwnerAccountId)).limit(1);
        if (!nextOwner || nextOwner.accountStatus !== "active" || nextOwner.id === accountId) {
          throw new ProductLifecycleServiceError("NEXT_OWNER_INVALID");
        }
      }
      const nextVersion = unit.authorizationVersion + 1;
      await tx.update(productUnits).set({
        status: input.toStatus,
        currentOwnerAccountId: input.toStatus === "transferred" ? input.nextOwnerAccountId : unit.currentOwnerAccountId,
        authorizationVersion: nextVersion,
        lastRequestId: requestId,
        ...(input.toStatus === "in_use" && !unit.activatedAt ? { activatedAt: occurredAt } : {}),
        ...(input.toStatus === "retired" ? { retiredAt: occurredAt } : {}),
      }).where(and(eq(productUnits.id, unit.id), eq(productUnits.authorizationVersion, unit.authorizationVersion)));
      const event = await appendPassportEvent(tx, {
        productUnitId: unit.id,
        sequenceNumber: 0,
        eventType: `status_${input.toStatus}`,
        actorAccountId: accountId,
        actorOrganizationId: null,
        fromStatus: unit.status,
        toStatus: input.toStatus,
        visibility,
        sourceType: optionalText(input.sourceType, "PASSPORT_SOURCE_TYPE_INVALID", 64) ?? null,
        sourceId: optionalText(input.sourceId, "PASSPORT_SOURCE_ID_INVALID", 64) ?? null,
        requestId,
        detail: {
          ...detail,
          ...(input.toStatus === "transferred" ? { ownershipTransferRecorded: true } : {}),
        },
        previousEventHash: null,
        occurredAt,
      });
      const [updated] = await tx.select().from(productUnits).where(eq(productUnits.id, unit.id)).limit(1);
      if (!updated || updated.authorizationVersion !== nextVersion) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      return { unit: productUnitView(updated), event: event.event, duplicate: false, noOp: false };
    });
    await auditSafely({
      actorId: accountId,
      actorRole: "user",
      action: "product.unit.transition",
      resourceType: "product_unit",
      resourceId: input.productUnitId,
      result: "success",
      riskLevel: "high",
      detail: { requestId, toStatus: input.toStatus, duplicate: result.duplicate, noOp: result.noOp },
    });
    return result;
  }

  async appendPassport(accountId: number, input: ProductPassportAppendInput) {
    const requestId = ensureRequestId(input.requestId);
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.passport.append",
      resourceType: "product_unit",
      resourceId: String(input.productUnitId),
      purpose: "product_passport_append",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const eventType = cleanText(input.eventType, "PASSPORT_EVENT_TYPE_INVALID", 64);
    const visibility = input.visibility ?? "owner";
    if (!PASSPORT_EVENT_VISIBILITIES.has(visibility)) throw new ProductLifecycleServiceError("PASSPORT_VISIBILITY_INVALID");
    const detail = normalizeJsonObject(input.detail, "PASSPORT_DETAIL_INVALID", 32_000);
    const occurredAt = input.occurredAt ?? new Date();
    const db = await requireDb();
    const result = await db.transaction(async (tx) => {
      const [unit] = await tx.select().from(productUnits).where(eq(productUnits.id, input.productUnitId)).for("update").limit(1);
      if (!unit || unit.currentOwnerAccountId !== accountId) throw new ProductLifecycleServiceError("RESOURCE_RELATION_REQUIRED");
      const [existing] = await tx.select().from(productPassportEvents).where(eq(productPassportEvents.requestId, requestId)).limit(1);
      if (existing) {
        if (existing.productUnitId !== unit.id || existing.eventType !== eventType) throw new ProductLifecycleServiceError("IDEMPOTENCY_CONFLICT");
        return { unit: productUnitView(unit), event: passportEventView(existing), duplicate: true };
      }
      assertExpectedVersion(unit.authorizationVersion, input.expectedAuthorizationVersion);
      const nextVersion = unit.authorizationVersion + 1;
      await tx.update(productUnits).set({ authorizationVersion: nextVersion, lastRequestId: requestId })
        .where(and(eq(productUnits.id, unit.id), eq(productUnits.authorizationVersion, unit.authorizationVersion)));
      const appended = await appendPassportEvent(tx, {
        productUnitId: unit.id,
        sequenceNumber: 0,
        eventType,
        actorAccountId: accountId,
        actorOrganizationId: null,
        fromStatus: unit.status,
        toStatus: unit.status,
        visibility,
        sourceType: optionalText(input.sourceType, "PASSPORT_SOURCE_TYPE_INVALID", 64) ?? null,
        sourceId: optionalText(input.sourceId, "PASSPORT_SOURCE_ID_INVALID", 64) ?? null,
        requestId,
        detail,
        previousEventHash: null,
        occurredAt,
      });
      const [updated] = await tx.select().from(productUnits).where(eq(productUnits.id, unit.id)).limit(1);
      if (!updated || updated.authorizationVersion !== nextVersion) throw new ProductLifecycleServiceError("CONCURRENT_MODIFICATION");
      return { unit: productUnitView(updated), event: appended.event, duplicate: false };
    });
    await auditSafely({
      actorId: accountId,
      actorRole: "user",
      action: "product.passport.append",
      resourceType: "product_unit",
      resourceId: input.productUnitId,
      result: "success",
      riskLevel: "high",
      detail: { requestId, eventType, visibility, duplicate: result.duplicate },
    });
    return result;
  }

  async listOwnerModels(accountId: number, options: { limit?: number; cursor?: number } = {}) {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const db = await requireDb();
    const rows = await db.select().from(productModels).where(and(
      eq(productModels.ownerAccountId, accountId),
      isNull(productModels.deletedAt),
      options.cursor ? lt(productModels.id, options.cursor) : undefined,
    )).orderBy(desc(productModels.id)).limit(limit + 1);
    const items = rows.slice(0, limit).map(productModelView);
    return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
  }

  async listPublicModels(options: { limit?: number; cursor?: number; categoryCode?: string } = {}) {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const db = await requireDb();
    const rows = await db.select().from(productModels).where(and(
      eq(productModels.visibility, "public"),
      eq(productModels.status, "active"),
      isNull(productModels.deletedAt),
      options.categoryCode ? eq(productModels.categoryCode, options.categoryCode) : undefined,
      options.cursor ? lt(productModels.id, options.cursor) : undefined,
    )).orderBy(desc(productModels.publishedAt), desc(productModels.id)).limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    return {
      items: pageRows.map(publicProductModelView),
      nextCursor: rows.length > limit ? pageRows.at(-1)?.id ?? null : null,
    };
  }

  async ownerModelDetail(accountId: number, productModelId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.model.view_owner",
      resourceType: "product_model",
      resourceId: String(productModelId),
      purpose: "product_model_owner_detail",
      requestId: `product-model-owner:${productModelId}:${accountId}`,
    });
    const db = await requireDb();
    const [model] = await db.select().from(productModels).where(and(eq(productModels.id, productModelId), isNull(productModels.deletedAt))).limit(1);
    if (!model) throw new ProductLifecycleServiceError("PRODUCT_MODEL_NOT_FOUND");
    const [sources, units] = await Promise.all([
      db.select().from(productSourceLinks).where(eq(productSourceLinks.productModelId, productModelId)).orderBy(asc(productSourceLinks.id)),
      db.select().from(productUnits).where(eq(productUnits.productModelId, productModelId)).orderBy(desc(productUnits.id)),
    ]);
    return { model: productModelView(model), sourceLinks: sources, units: units.map(productUnitView) };
  }

  async publicModelDetail(publicCode: string) {
    const code = cleanText(publicCode, "PRODUCT_PUBLIC_CODE_INVALID", 32);
    const db = await requireDb();
    const [model] = await db.select().from(productModels).where(and(
      eq(productModels.publicCode, code),
      eq(productModels.visibility, "public"),
      eq(productModels.status, "active"),
      isNull(productModels.deletedAt),
    )).limit(1);
    if (!model) throw new ProductLifecycleServiceError("PRODUCT_MODEL_NOT_FOUND");
    const sources = await db.select({
      sourceType: productSourceLinks.sourceType,
      sourceId: productSourceLinks.sourceId,
      relationType: productSourceLinks.relationType,
    }).from(productSourceLinks).where(and(
      eq(productSourceLinks.productModelId, model.id),
      inArray(productSourceLinks.sourceType, ["need", "idea"]),
    )).orderBy(asc(productSourceLinks.id));
    return { model: publicProductModelView(model), sourceLinks: sources };
  }

  async ownerUnitDetail(accountId: number, productUnitId: number) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "product.passport.view_owner",
      resourceType: "product_unit",
      resourceId: String(productUnitId),
      purpose: "product_unit_owner_detail",
      requestId: `product-unit-owner:${productUnitId}:${accountId}`,
    });
    const db = await requireDb();
    const [unit] = await db.select().from(productUnits).where(eq(productUnits.id, productUnitId)).limit(1);
    if (!unit) throw new ProductLifecycleServiceError("PRODUCT_UNIT_NOT_FOUND");
    const [model] = await db.select().from(productModels).where(eq(productModels.id, unit.productModelId)).limit(1);
    if (!model) throw new ProductLifecycleServiceError("PRODUCT_MODEL_NOT_FOUND");
    const events = await db.select().from(productPassportEvents).where(and(
      eq(productPassportEvents.productUnitId, productUnitId),
      inArray(productPassportEvents.visibility, ["public", "owner"]),
    )).orderBy(asc(productPassportEvents.sequenceNumber));
    return { model: productModelView(model), unit: productUnitView(unit), events: events.map(passportEventView) };
  }

  async publicUnitDetail(publicCode: string) {
    const code = cleanText(publicCode, "PRODUCT_UNIT_PUBLIC_CODE_INVALID", 40);
    const db = await requireDb();
    const [row] = await db.select({ unit: productUnits, model: productModels }).from(productUnits)
      .innerJoin(productModels, eq(productModels.id, productUnits.productModelId))
      .where(and(
        eq(productUnits.publicCode, code),
        eq(productUnits.passportVisibility, "public"),
        eq(productModels.visibility, "public"),
        eq(productModels.status, "active"),
        isNull(productModels.deletedAt),
      )).limit(1);
    if (!row) throw new ProductLifecycleServiceError("PRODUCT_UNIT_NOT_FOUND");
    const events = await db.select().from(productPassportEvents).where(and(
      eq(productPassportEvents.productUnitId, row.unit.id),
      eq(productPassportEvents.visibility, "public"),
    )).orderBy(asc(productPassportEvents.sequenceNumber));
    return {
      model: publicProductModelView(row.model),
      unit: publicProductUnitView(row.unit),
      events: events.map(publicPassportEventView),
    };
  }
}

export const productLifecycleService = new ProductLifecycleService();
