import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  businessIdentities,
  contentComments,
  contentDrafts,
  contentFollows,
  contentInteractions,
  contentMedia,
  contentMetrics,
  contentModerationRecords,
  contentPosts,
  contentRelations,
  contentReports,
  contentTagLinks,
  contentTags,
  creatorProfiles,
  fundingCampaigns,
  ideas,
  listings,
  needs,
  organizationMemberships,
  organizations,
  productModels,
  productUnits,
  recyclingRequests,
  storedFiles,
  users,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";
import { requireDb } from "../db";
import { writeAudit } from "./audit-service";

export const CONTENT_TYPES = ["post", "video", "article", "question", "product_review", "tutorial", "idea_progress", "funding_update", "repair_case"] as const;
export const CONTENT_SOURCES = ["personal_experience", "organization_official", "service_case", "platform_verified", "external_public", "ai_assisted", "unverified_claim"] as const;
export const CONTENT_RELATION_TYPES = ["demand", "idea", "funding_project", "product", "product_unit", "listing", "repair", "service", "donation", "recycling", "account", "organization"] as const;
export const DISCOVERY_CHANNELS = ["recommended", "following", "products", "ideas", "experience", "videos", "questions", "nearby"] as const;

export type ContentType = typeof CONTENT_TYPES[number];
export type ContentSource = typeof CONTENT_SOURCES[number];
export type ContentRelationType = typeof CONTENT_RELATION_TYPES[number];
export type DiscoveryChannel = typeof DISCOVERY_CHANNELS[number];
export type ContentStatus = typeof contentPosts.$inferSelect.status;

export class ContentServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ContentServiceError";
  }
}

const TRANSITIONS: Readonly<Record<ContentStatus, ReadonlySet<ContentStatus>>> = {
  draft: new Set(["ready_to_publish", "author_deleted"]),
  ready_to_publish: new Set(["reviewing", "draft", "author_deleted"]),
  reviewing: new Set(["published", "rejected", "platform_banned"]),
  published: new Set(["recommendation_limited", "unpublished", "author_deleted", "platform_banned"]),
  rejected: new Set(["draft", "author_deleted"]),
  recommendation_limited: new Set(["published", "unpublished", "author_deleted", "platform_banned"]),
  unpublished: new Set(["draft", "author_deleted", "platform_banned"]),
  author_deleted: new Set(),
  platform_banned: new Set(),
};

export function canTransitionContent(from: ContentStatus, to: ContentStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function assertContentTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransitionContent(from, to)) throw new ContentServiceError("CONTENT_STATE_TRANSITION_INVALID");
}

function requestId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(normalized)) throw new ContentServiceError("REQUEST_ID_INVALID");
  return normalized;
}

function requiredText(value: string, max: number, code: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new ContentServiceError(code);
  return normalized;
}

function optionalText(value: string | null | undefined, max: number, code: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  const normalized = value.trim();
  if (normalized.length > max) throw new ContentServiceError(code);
  return normalized || null;
}

function normalizeTags(values: string[] | undefined): string[] {
  return [...new Map((values ?? []).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()].slice(0, 10);
}

async function audit(accountId: number, action: string, resourceId: number, detail?: Record<string, unknown>) {
  await writeAudit({ actorId: accountId, actorRole: "user", action, resourceType: "content_post", resourceId, detail });
}

type DraftInput = {
  contentType: ContentType;
  title: string;
  summary?: string | null;
  body: string;
  locationLabel?: string | null;
  visibility?: "public" | "followers" | "private";
  sourceType?: ContentSource;
  sourceStatement?: string | null;
  allowComments?: boolean;
  authorIdentityId?: number | null;
  organizationId?: number | null;
  tags?: string[];
  requestId: string;
};

type RelationInput = { relationType: ContentRelationType; relationId: number; relationLabel?: string };
type MediaInput = { fileId: number; mediaType: "image" | "video"; purpose?: "cover" | "body"; sortOrder?: number };

function draftSnapshot(values: Record<string, unknown>, tags: string[]) {
  return { ...values, tags };
}

async function validateIdentityContext(accountId: number, authorIdentityId?: number | null, organizationId?: number | null) {
  const db = await requireDb();
  if (authorIdentityId) {
    const rows = await db.select({ id: businessIdentities.id }).from(businessIdentities)
      .where(and(eq(businessIdentities.id, authorIdentityId), eq(businessIdentities.accountId, accountId), eq(businessIdentities.status, "active"))).limit(1);
    if (!rows[0]) throw new ContentServiceError("AUTHOR_IDENTITY_FORBIDDEN");
  }
  if (organizationId) {
    const rows = await db.select({ id: organizationMemberships.id }).from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.accountId, accountId), eq(organizationMemberships.status, "active"))).limit(1);
    if (!rows[0]) throw new ContentServiceError("ORGANIZATION_CONTEXT_FORBIDDEN");
  }
}

async function requireOwnedPost(accountId: number, postId: number) {
  const db = await requireDb();
  const rows = await db.select().from(contentPosts)
    .where(and(eq(contentPosts.id, postId), eq(contentPosts.authorAccountId, accountId), isNull(contentPosts.deletedAt))).limit(1);
  if (!rows[0]) throw new ContentServiceError("CONTENT_NOT_FOUND");
  return rows[0];
}

async function requireVisiblePost(postId: number, accountId?: number) {
  const db = await requireDb();
  const rows = await db.select().from(contentPosts).where(and(
    eq(contentPosts.id, postId),
    isNull(contentPosts.deletedAt),
    or(
      and(eq(contentPosts.status, "published"), eq(contentPosts.visibility, "public")),
      accountId ? eq(contentPosts.authorAccountId, accountId) : sql`false`,
    ),
  )).limit(1);
  if (!rows[0]) throw new ContentServiceError("CONTENT_NOT_FOUND");
  return rows[0];
}

async function replaceTags(postId: number, values: string[]) {
  const db = await requireDb();
  await db.delete(contentTagLinks).where(eq(contentTagLinks.postId, postId));
  for (const displayName of values) {
    const normalizedName = displayName.toLocaleLowerCase();
    await db.insert(contentTags).values({ normalizedName, displayName }).onDuplicateKeyUpdate({ set: { displayName } });
    const tags = await db.select({ id: contentTags.id }).from(contentTags).where(eq(contentTags.normalizedName, normalizedName)).limit(1);
    if (tags[0]) await db.insert(contentTagLinks).values({ postId, tagId: tags[0].id }).onDuplicateKeyUpdate({ set: { postId } });
  }
}

async function validateRelation(accountId: number, relation: RelationInput): Promise<string> {
  const db = await requireDb();
  const { relationId: id, relationType: type } = relation;
  if (!Number.isInteger(id) || id <= 0) throw new ContentServiceError("CONTENT_RELATION_INVALID");
  if (type === "demand" || type === "repair") {
    const rows = await db.select({ title: needs.title, creatorId: needs.creatorId, visibility: needs.visibility, status: needs.status, needType: needs.needType }).from(needs).where(eq(needs.id, id)).limit(1);
    const row = rows[0];
    if (!row || (type === "repair" && row.needType !== "repair") || (row.creatorId !== accountId && (row.visibility !== "public" || row.status === "draft" || row.status === "rejected"))) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.title;
  }
  if (type === "idea") {
    const rows = await db.select({ title: ideas.title, creator: ideas.creatorAccountId, visibility: ideas.visibility, status: ideas.status, deletedAt: ideas.deletedAt }).from(ideas).where(eq(ideas.id, id)).limit(1);
    const row = rows[0];
    if (!row || row.deletedAt || (row.creator !== accountId && (row.visibility !== "public" || row.status === "draft"))) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.title;
  }
  if (type === "funding_project") {
    const rows = await db.select({ title: fundingCampaigns.title, creator: fundingCampaigns.ownerAccountId, visibility: fundingCampaigns.visibility, status: fundingCampaigns.status }).from(fundingCampaigns).where(eq(fundingCampaigns.id, id)).limit(1);
    const row = rows[0];
    if (!row || (row.creator !== accountId && row.visibility !== "public")) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.title;
  }
  if (type === "product") {
    const rows = await db.select({ name: productModels.name, owner: productModels.ownerAccountId, visibility: productModels.visibility, status: productModels.status }).from(productModels).where(eq(productModels.id, id)).limit(1);
    const row = rows[0];
    if (!row || (row.owner !== accountId && (row.visibility !== "public" || row.status !== "active"))) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.name;
  }
  if (type === "product_unit") {
    const rows = await db.select({ code: productUnits.publicCode, owner: productUnits.currentOwnerAccountId, visibility: productUnits.passportVisibility }).from(productUnits).where(eq(productUnits.id, id)).limit(1);
    const row = rows[0];
    if (!row || (row.owner !== accountId && row.visibility !== "public")) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.code;
  }
  if (type === "listing" || type === "donation") {
    const rows = await db.select({ title: listings.title, seller: listings.sellerId, status: listings.status, primaryMode: listings.primaryMode }).from(listings).where(eq(listings.id, id)).limit(1);
    const row = rows[0];
    if (!row || (type === "donation" && row.primaryMode !== "giveaway") || (row.seller !== accountId && row.status !== "published")) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.title;
  }
  if (type === "recycling") {
    const rows = await db.select({ title: recyclingRequests.title, owner: recyclingRequests.userId, status: recyclingRequests.status }).from(recyclingRequests).where(eq(recyclingRequests.id, id)).limit(1);
    const row = rows[0];
    if (!row || (row.owner !== accountId && !["quoting", "quoted"].includes(row.status))) throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || row.title;
  }
  if (type === "account" || type === "service") {
    const rows = await db.select({ name: users.name, status: users.accountStatus }).from(users).where(eq(users.id, id)).limit(1);
    if (!rows[0] || rows[0].status !== "active") throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || rows[0].name || `用户 ${id}`;
  }
  if (type === "organization") {
    const rows = await db.select({ name: organizations.name, status: organizations.status }).from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!rows[0] || rows[0].status !== "active") throw new ContentServiceError("CONTENT_RELATION_FORBIDDEN");
    return relation.relationLabel?.trim() || rows[0].name;
  }
  throw new ContentServiceError("CONTENT_RELATION_TYPE_INVALID");
}

async function relationRoute(type: ContentRelationType, id: number): Promise<string | null> {
  const db = await requireDb();
  if (type === "product") {
    const rows = await db.select({ publicCode: productModels.publicCode }).from(productModels).where(eq(productModels.id, id)).limit(1);
    return rows[0] ? `/products/${rows[0].publicCode}` : null;
  }
  if (type === "product_unit") {
    const rows = await db.select({ publicCode: productUnits.publicCode }).from(productUnits).where(eq(productUnits.id, id)).limit(1);
    return rows[0] ? `/products/passport/${rows[0].publicCode}` : null;
  }
  if (type === "funding_project") {
    const rows = await db.select({ publicCode: fundingCampaigns.publicCode }).from(fundingCampaigns).where(eq(fundingCampaigns.id, id)).limit(1);
    return rows[0] ? `/funding/${rows[0].publicCode}` : null;
  }
  if (type === "idea") return `/ideas/${id}`;
  if (type === "listing" || type === "donation") return `/listings/${id}`;
  if (type === "demand" || type === "repair") return `/needs/${id}`;
  if (type === "recycling") return `/recycling/${id}`;
  if (type === "service") return `/engineers/${id}`;
  if (type === "organization") return `/organizations/${id}`;
  return null;
}

export class ContentService {
  async createDraft(accountId: number, input: DraftInput) {
    const rid = requestId(input.requestId);
    const db = await requireDb();
    const existing = await db.select().from(contentPosts).where(eq(contentPosts.createdRequestId, rid)).limit(1);
    if (existing[0]) {
      if (existing[0].authorAccountId !== accountId) throw new ContentServiceError("IDEMPOTENCY_CONFLICT");
      return existing[0];
    }
    await validateIdentityContext(accountId, input.authorIdentityId, input.organizationId);
    const tags = normalizeTags(input.tags);
    const values = {
      contentType: input.contentType,
      title: requiredText(input.title, 180, "CONTENT_TITLE_INVALID"),
      summary: optionalText(input.summary, 500, "CONTENT_SUMMARY_INVALID"),
      body: requiredText(input.body, 50_000, "CONTENT_BODY_INVALID"),
      locationLabel: optionalText(input.locationLabel, 100, "CONTENT_LOCATION_INVALID"),
      visibility: input.visibility ?? "private" as const,
      sourceType: input.sourceType ?? "personal_experience" as const,
      sourceStatement: optionalText(input.sourceStatement, 500, "CONTENT_SOURCE_INVALID"),
      allowComments: input.allowComments ?? true,
      authorIdentityId: input.authorIdentityId ?? null,
      organizationId: input.organizationId ?? null,
    };
    const post = await db.transaction(async (tx) => {
      const inserted = await tx.insert(contentPosts).values({ ...values, publicCode: randomUUID(), authorAccountId: accountId, status: "draft", createdRequestId: rid, lastRequestId: rid });
      const postId = Number(inserted[0].insertId);
      await tx.insert(contentMetrics).values({ postId });
      await tx.insert(contentDrafts).values({ postId, versionNo: 1, snapshot: draftSnapshot(values, tags), savedByAccountId: accountId, requestId: `${rid}:v1`.slice(0, 64) });
      await tx.insert(creatorProfiles).values({ accountId }).onDuplicateKeyUpdate({ set: { accountId } });
      const rows = await tx.select().from(contentPosts).where(eq(contentPosts.id, postId)).limit(1);
      return rows[0];
    });
    if (!post) throw new ContentServiceError("CONTENT_CREATE_FAILED");
    await replaceTags(post.id, tags);
    await audit(accountId, "content.create_draft", post.id, { contentType: post.contentType });
    return post;
  }

  async saveDraft(accountId: number, postId: number, input: Omit<Partial<DraftInput>, "requestId"> & { requestId: string }) {
    const rid = requestId(input.requestId);
    const current = await requireOwnedPost(accountId, postId);
    const db = await requireDb();
    if (current.lastRequestId === rid) return current;
    if (!["draft", "ready_to_publish", "rejected", "unpublished"].includes(current.status)) throw new ContentServiceError("CONTENT_NOT_EDITABLE");
    await validateIdentityContext(accountId, input.authorIdentityId, input.organizationId);
    const tags = input.tags === undefined ? undefined : normalizeTags(input.tags);
    const patch = {
      contentType: input.contentType,
      title: input.title === undefined ? undefined : requiredText(input.title, 180, "CONTENT_TITLE_INVALID"),
      summary: optionalText(input.summary, 500, "CONTENT_SUMMARY_INVALID"),
      body: input.body === undefined ? undefined : requiredText(input.body, 50_000, "CONTENT_BODY_INVALID"),
      locationLabel: optionalText(input.locationLabel, 100, "CONTENT_LOCATION_INVALID"),
      visibility: input.visibility,
      sourceType: input.sourceType,
      sourceStatement: optionalText(input.sourceStatement, 500, "CONTENT_SOURCE_INVALID"),
      allowComments: input.allowComments,
      authorIdentityId: input.authorIdentityId,
      organizationId: input.organizationId,
      status: current.status === "draft" ? undefined : "draft" as const,
      moderationReason: current.status === "rejected" ? null : undefined,
      authorizationVersion: current.authorizationVersion + 1,
      lastRequestId: rid,
    };
    const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const saved = await db.transaction(async (tx) => {
      const versions = await tx.select({ versionNo: contentDrafts.versionNo }).from(contentDrafts).where(eq(contentDrafts.postId, postId)).orderBy(desc(contentDrafts.versionNo)).limit(1);
      const versionNo = (versions[0]?.versionNo ?? 0) + 1;
      await tx.update(contentPosts).set(cleanPatch).where(and(eq(contentPosts.id, postId), eq(contentPosts.authorizationVersion, current.authorizationVersion)));
      await tx.insert(contentDrafts).values({ postId, versionNo, snapshot: draftSnapshot(cleanPatch, tags ?? []), savedByAccountId: accountId, requestId: rid });
      return versionNo;
    });
    if (tags) await replaceTags(postId, tags);
    await audit(accountId, "content.save_draft", postId, { versionNo: saved });
    return requireOwnedPost(accountId, postId);
  }

  async replaceMedia(accountId: number, postId: number, media: MediaInput[], ridValue: string) {
    const rid = requestId(ridValue);
    const post = await requireOwnedPost(accountId, postId);
    if (!["draft", "ready_to_publish", "rejected", "unpublished"].includes(post.status)) throw new ContentServiceError("CONTENT_NOT_EDITABLE");
    const db = await requireDb();
    const unique = [...new Map(media.map((item) => [item.fileId, item])).values()];
    if (unique.length > 20) throw new ContentServiceError("CONTENT_MEDIA_LIMIT_EXCEEDED");
    for (const item of unique) {
      const files = await db.select().from(storedFiles).where(and(eq(storedFiles.id, item.fileId), eq(storedFiles.ownerId, accountId))).limit(1);
      const file = files[0];
      if (!file || file.status !== "available" || file.virusScanStatus !== "clean" || file.privacyLevel !== "public") throw new ContentServiceError("CONTENT_MEDIA_UNAVAILABLE");
      if ((item.mediaType === "image" && !file.mimeType.startsWith("image/")) || (item.mediaType === "video" && !file.mimeType.startsWith("video/"))) throw new ContentServiceError("CONTENT_MEDIA_TYPE_MISMATCH");
    }
    await db.transaction(async (tx) => {
      await tx.delete(contentMedia).where(eq(contentMedia.postId, postId));
      if (unique.length) await tx.insert(contentMedia).values(unique.map((item, index) => ({ postId, fileId: item.fileId, mediaType: item.mediaType, purpose: item.purpose ?? "body", sortOrder: item.sortOrder ?? index })));
      await tx.update(contentPosts).set({ lastRequestId: rid, authorizationVersion: post.authorizationVersion + 1 }).where(eq(contentPosts.id, postId));
    });
    await audit(accountId, "content.replace_media", postId, { count: unique.length });
    return { postId, count: unique.length };
  }

  async replaceRelations(accountId: number, postId: number, relations: RelationInput[], ridValue: string) {
    const rid = requestId(ridValue);
    const post = await requireOwnedPost(accountId, postId);
    if (!["draft", "ready_to_publish", "rejected", "unpublished"].includes(post.status)) throw new ContentServiceError("CONTENT_NOT_EDITABLE");
    const unique = [...new Map(relations.map((item) => [`${item.relationType}:${item.relationId}`, item])).values()];
    if (unique.length > 20) throw new ContentServiceError("CONTENT_RELATION_LIMIT_EXCEEDED");
    const validated = [] as Array<RelationInput & { relationLabel: string }>;
    for (const relation of unique) validated.push({ ...relation, relationLabel: await validateRelation(accountId, relation) });
    const db = await requireDb();
    await db.transaction(async (tx) => {
      await tx.delete(contentRelations).where(eq(contentRelations.postId, postId));
      if (validated.length) await tx.insert(contentRelations).values(validated.map((relation) => ({ postId, relationType: relation.relationType, relationId: relation.relationId, relationLabel: relation.relationLabel, createdByAccountId: accountId })));
      await tx.update(contentPosts).set({ lastRequestId: rid, authorizationVersion: post.authorizationVersion + 1 }).where(eq(contentPosts.id, postId));
    });
    await audit(accountId, "content.replace_relations", postId, { relations: validated.map(({ relationType, relationId }) => ({ relationType, relationId })) });
    return validated;
  }

  async suggestWithAi(accountId: number, postId: number) {
    const post = await requireOwnedPost(accountId, postId);
    if (!ENV.aiApiKey) {
      const words = post.body.replace(/\s+/g, " ").trim();
      return { title: post.title || words.slice(0, 30), summary: post.summary || words.slice(0, 120), tags: [post.contentType], provider: "local_fallback" as const, requiresConfirmation: true };
    }
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是生活帮内容创作助手。只整理用户已有事实，不新增结论。返回 JSON：title、summary、tags（最多5个）。" },
        { role: "user", content: `类型:${post.contentType}\n标题:${post.title}\n正文:${post.body}` },
      ],
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as { title?: string; summary?: string; tags?: string[] };
    return { title: optionalText(parsed.title, 180, "AI_RESULT_INVALID") ?? post.title, summary: optionalText(parsed.summary, 500, "AI_RESULT_INVALID") ?? post.summary, tags: normalizeTags(parsed.tags), provider: "configured_ai" as const, requiresConfirmation: true };
  }

  async confirmAi(accountId: number, postId: number, input: { title: string; summary?: string | null; tags?: string[]; requestId: string }) {
    const rid = requestId(input.requestId);
    const post = await requireOwnedPost(accountId, postId);
    if (post.lastRequestId === rid) return post;
    const db = await requireDb();
    await db.update(contentPosts).set({ title: requiredText(input.title, 180, "CONTENT_TITLE_INVALID"), summary: optionalText(input.summary, 500, "CONTENT_SUMMARY_INVALID"), aiAssisted: true, aiConfirmedAt: new Date(), sourceType: post.sourceType === "platform_verified" ? post.sourceType : "ai_assisted", lastRequestId: rid, authorizationVersion: post.authorizationVersion + 1 }).where(eq(contentPosts.id, postId));
    if (input.tags) await replaceTags(postId, normalizeTags(input.tags));
    await audit(accountId, "content.confirm_ai", postId, { confirmed: true });
    return requireOwnedPost(accountId, postId);
  }

  async publish(accountId: number, postId: number, ridValue: string) {
    const rid = requestId(ridValue);
    const post = await requireOwnedPost(accountId, postId);
    if (post.status === "published" && post.lastRequestId === rid) return post;
    if (post.status !== "draft") throw new ContentServiceError("CONTENT_NOT_PUBLISHABLE");
    if (post.visibility === "private") throw new ContentServiceError("CONTENT_VISIBILITY_PRIVATE");
    if (!post.sourceStatement?.trim()) throw new ContentServiceError("CONTENT_SOURCE_REQUIRED");
    if (post.sourceType === "organization_official" && !post.organizationId) throw new ContentServiceError("ORGANIZATION_CONTEXT_REQUIRED");
    if (post.sourceType === "platform_verified") throw new ContentServiceError("PLATFORM_VERIFICATION_RESERVED");
    if (post.aiAssisted && !post.aiConfirmedAt) throw new ContentServiceError("AI_CONFIRMATION_REQUIRED");
    await validateIdentityContext(accountId, post.authorIdentityId, post.organizationId);
    const db = await requireDb();
    const media = await db.select().from(contentMedia).where(and(eq(contentMedia.postId, postId), eq(contentMedia.status, "active")));
    for (const entry of media) {
      const files = await db.select().from(storedFiles).where(eq(storedFiles.id, entry.fileId)).limit(1);
      if (!files[0] || files[0].status !== "available" || files[0].virusScanStatus !== "clean" || files[0].privacyLevel !== "public") throw new ContentServiceError("CONTENT_MEDIA_UNAVAILABLE");
    }
    const relations = await db.select().from(contentRelations).where(eq(contentRelations.postId, postId));
    for (const relation of relations) await validateRelation(accountId, { relationType: relation.relationType, relationId: relation.relationId, relationLabel: relation.relationLabel ?? undefined });
    if (post.sourceType === "service_case" && !relations.some((relation) => ["service", "repair"].includes(relation.relationType))) throw new ContentServiceError("SERVICE_CASE_RELATION_REQUIRED");
    assertContentTransition("draft", "ready_to_publish");
    assertContentTransition("ready_to_publish", "reviewing");
    assertContentTransition("reviewing", "published");
    await db.transaction(async (tx) => {
      await tx.update(contentPosts).set({ status: "ready_to_publish", authorizationVersion: post.authorizationVersion + 1 }).where(and(eq(contentPosts.id, postId), eq(contentPosts.status, "draft")));
      await tx.update(contentPosts).set({ status: "reviewing", authorizationVersion: post.authorizationVersion + 2 }).where(and(eq(contentPosts.id, postId), eq(contentPosts.status, "ready_to_publish")));
      await tx.insert(contentModerationRecords).values({ postId, actorAccountId: accountId, moderationType: "automated", decision: "approved", reasonCode: "PROTOTYPE_POLICY_PASSED", detail: { mediaCount: media.length, relationCount: relations.length }, requestId: `${rid}:moderation`.slice(0, 64) });
      await tx.update(contentPosts).set({ status: "published", visibility: post.visibility, publishedAt: new Date(), lastRequestId: rid, authorizationVersion: post.authorizationVersion + 3 }).where(and(eq(contentPosts.id, postId), eq(contentPosts.status, "reviewing")));
      await tx.update(creatorProfiles).set({ publishedCount: sql`${creatorProfiles.publishedCount} + 1` }).where(eq(creatorProfiles.accountId, accountId));
    });
    await audit(accountId, "content.publish", postId, { sourceType: post.sourceType, relationCount: relations.length });
    return requireOwnedPost(accountId, postId);
  }

  async detail(postId: number, accountId?: number) {
    const post = await requireVisiblePost(postId, accountId);
    const db = await requireDb();
    const [media, relations, tags, metrics, comments, author, viewer] = await Promise.all([
      db.select().from(contentMedia).where(and(eq(contentMedia.postId, postId), eq(contentMedia.status, "active"))).orderBy(contentMedia.sortOrder),
      db.select().from(contentRelations).where(eq(contentRelations.postId, postId)),
      db.select({ id: contentTags.id, name: contentTags.displayName }).from(contentTagLinks).innerJoin(contentTags, eq(contentTagLinks.tagId, contentTags.id)).where(eq(contentTagLinks.postId, postId)),
      db.select().from(contentMetrics).where(eq(contentMetrics.postId, postId)).limit(1),
      db.select({ id: contentComments.id, authorAccountId: contentComments.authorAccountId, authorName: users.name, body: contentComments.body, createdAt: contentComments.createdAt }).from(contentComments).innerJoin(users, eq(contentComments.authorAccountId, users.id)).where(and(eq(contentComments.postId, postId), eq(contentComments.status, "published"))).orderBy(contentComments.createdAt),
      db.select({ id: users.id, name: users.name, verificationLabel: creatorProfiles.verificationLabel }).from(users).leftJoin(creatorProfiles, eq(users.id, creatorProfiles.accountId)).where(eq(users.id, post.authorAccountId)).limit(1),
      accountId ? db.select({ type: contentInteractions.interactionType, active: contentInteractions.active }).from(contentInteractions).where(and(eq(contentInteractions.postId, postId), eq(contentInteractions.accountId, accountId), inArray(contentInteractions.interactionType, ["like", "favorite"]))) : Promise.resolve([]),
    ]);
    const linkedRelations = await Promise.all(relations.map(async (relation) => ({ ...relation, route: await relationRoute(relation.relationType, relation.relationId) })));
    return { ...post, media, relations: linkedRelations, tags, metrics: metrics[0], comments, author: author[0], viewer: { liked: viewer.some((v) => v.type === "like" && v.active), favorited: viewer.some((v) => v.type === "favorite" && v.active) } };
  }

  async discover(input: { channel?: DiscoveryChannel; cursor?: number; limit?: number; locationLabel?: string }, accountId?: number) {
    const db = await requireDb();
    const channel = input.channel ?? "recommended";
    const filters = [eq(contentPosts.status, "published"), eq(contentPosts.visibility, "public"), isNull(contentPosts.deletedAt)];
    if (input.cursor) filters.push(lt(contentPosts.id, input.cursor));
    if (channel === "products") filters.push(inArray(contentPosts.contentType, ["product_review", "tutorial"]));
    if (channel === "ideas") filters.push(eq(contentPosts.contentType, "idea_progress"));
    if (channel === "experience") filters.push(inArray(contentPosts.contentType, ["post", "article", "tutorial", "repair_case"]));
    if (channel === "videos") filters.push(eq(contentPosts.contentType, "video"));
    if (channel === "questions") filters.push(eq(contentPosts.contentType, "question"));
    if (channel === "nearby" && input.locationLabel?.trim()) filters.push(eq(contentPosts.locationLabel, input.locationLabel.trim()));
    if (channel === "following") {
      if (!accountId) return [];
      const followed = await db.select({ id: contentFollows.followedAccountId }).from(contentFollows).where(and(eq(contentFollows.followerAccountId, accountId), eq(contentFollows.active, true)));
      if (!followed.length) return [];
      filters.push(inArray(contentPosts.authorAccountId, followed.map((row) => row.id)));
    }
    const rows = await db.select({ post: contentPosts, metrics: contentMetrics, authorName: users.name, verificationLabel: creatorProfiles.verificationLabel })
      .from(contentPosts).innerJoin(users, eq(contentPosts.authorAccountId, users.id)).leftJoin(contentMetrics, eq(contentPosts.id, contentMetrics.postId)).leftJoin(creatorProfiles, eq(contentPosts.authorAccountId, creatorProfiles.accountId))
      .where(and(...filters)).orderBy(desc(contentPosts.publishedAt), desc(contentPosts.id)).limit(Math.min(input.limit ?? 20, 50));
    if (!rows.length) return [];
    const postIds = rows.map((row) => row.post.id);
    const [media, relations, tags, viewer] = await Promise.all([
      db.select({ postId: contentMedia.postId, fileId: contentMedia.fileId, mediaType: contentMedia.mediaType, purpose: contentMedia.purpose, sortOrder: contentMedia.sortOrder }).from(contentMedia).where(and(inArray(contentMedia.postId, postIds), eq(contentMedia.status, "active"))).orderBy(contentMedia.sortOrder),
      db.select({ postId: contentRelations.postId, relationType: contentRelations.relationType, relationId: contentRelations.relationId, relationLabel: contentRelations.relationLabel }).from(contentRelations).where(inArray(contentRelations.postId, postIds)),
      db.select({ postId: contentTagLinks.postId, id: contentTags.id, name: contentTags.displayName }).from(contentTagLinks).innerJoin(contentTags, eq(contentTagLinks.tagId, contentTags.id)).where(inArray(contentTagLinks.postId, postIds)),
      accountId ? db.select({ postId: contentInteractions.postId, type: contentInteractions.interactionType, active: contentInteractions.active }).from(contentInteractions).where(and(inArray(contentInteractions.postId, postIds), eq(contentInteractions.accountId, accountId), inArray(contentInteractions.interactionType, ["like", "favorite"]))) : Promise.resolve([]),
    ]);
    const linkedRelations = await Promise.all(relations.map(async (relation) => ({ ...relation, route: await relationRoute(relation.relationType, relation.relationId) })));
    return rows.map((row) => ({
      ...row,
      media: media.filter((item) => item.postId === row.post.id),
      relations: linkedRelations.filter((item) => item.postId === row.post.id),
      tags: tags.filter((item) => item.postId === row.post.id),
      viewer: {
        liked: viewer.some((item) => item.postId === row.post.id && item.type === "like" && item.active),
        favorited: viewer.some((item) => item.postId === row.post.id && item.type === "favorite" && item.active),
      },
    }));
  }

  async mine(accountId: number, input: { status?: ContentStatus; cursor?: number; limit?: number }) {
    const db = await requireDb();
    const filters = [eq(contentPosts.authorAccountId, accountId), isNull(contentPosts.deletedAt)];
    if (input.status) filters.push(eq(contentPosts.status, input.status));
    if (input.cursor) filters.push(lt(contentPosts.id, input.cursor));
    return db.select({ post: contentPosts, metrics: contentMetrics }).from(contentPosts).leftJoin(contentMetrics, eq(contentPosts.id, contentMetrics.postId)).where(and(...filters)).orderBy(desc(contentPosts.updatedAt), desc(contentPosts.id)).limit(Math.min(input.limit ?? 20, 50));
  }

  async dashboard(accountId: number) {
    const db = await requireDb();
    const profiles = await db.select().from(creatorProfiles).where(eq(creatorProfiles.accountId, accountId)).limit(1);
    const drafts = await db.select({ count: sql<number>`count(*)` }).from(contentPosts).where(and(eq(contentPosts.authorAccountId, accountId), inArray(contentPosts.status, ["draft", "ready_to_publish", "rejected", "unpublished"])));
    return { profile: profiles[0] ?? null, draftCount: Number(drafts[0]?.count ?? 0), orderConversion: null, orderConversionStatus: "reserved_metric" as const };
  }

  async myComments(accountId: number, limit = 50) {
    const db = await requireDb();
    return db.select({ id: contentComments.id, postId: contentComments.postId, postTitle: contentPosts.title, body: contentComments.body, status: contentComments.status, createdAt: contentComments.createdAt })
      .from(contentComments).innerJoin(contentPosts, eq(contentComments.postId, contentPosts.id))
      .where(eq(contentComments.authorAccountId, accountId)).orderBy(desc(contentComments.createdAt)).limit(Math.min(limit, 100));
  }

  async myFollows(accountId: number, direction: "following" | "followers", limit = 50) {
    const db = await requireDb();
    if (direction === "following") {
      return db.select({ accountId: users.id, name: users.name, verificationLabel: creatorProfiles.verificationLabel, followedAt: contentFollows.createdAt })
        .from(contentFollows).innerJoin(users, eq(contentFollows.followedAccountId, users.id)).leftJoin(creatorProfiles, eq(users.id, creatorProfiles.accountId))
        .where(and(eq(contentFollows.followerAccountId, accountId), eq(contentFollows.active, true))).orderBy(desc(contentFollows.createdAt)).limit(Math.min(limit, 100));
    }
    return db.select({ accountId: users.id, name: users.name, verificationLabel: creatorProfiles.verificationLabel, followedAt: contentFollows.createdAt })
      .from(contentFollows).innerJoin(users, eq(contentFollows.followerAccountId, users.id)).leftJoin(creatorProfiles, eq(users.id, creatorProfiles.accountId))
      .where(and(eq(contentFollows.followedAccountId, accountId), eq(contentFollows.active, true))).orderBy(desc(contentFollows.createdAt)).limit(Math.min(limit, 100));
  }

  async myFavorites(accountId: number, limit = 50) {
    const db = await requireDb();
    return db.select({ id: contentPosts.id, title: contentPosts.title, contentType: contentPosts.contentType, authorName: users.name, favoritedAt: contentInteractions.updatedAt })
      .from(contentInteractions).innerJoin(contentPosts, eq(contentInteractions.postId, contentPosts.id)).innerJoin(users, eq(contentPosts.authorAccountId, users.id))
      .where(and(eq(contentInteractions.accountId, accountId), eq(contentInteractions.interactionType, "favorite"), eq(contentInteractions.active, true), eq(contentPosts.status, "published")))
      .orderBy(desc(contentInteractions.updatedAt)).limit(Math.min(limit, 100));
  }

  async setInteraction(accountId: number, postId: number, type: "like" | "favorite", active: boolean, ridValue: string) {
    const rid = requestId(ridValue);
    const post = await requireVisiblePost(postId, accountId);
    const db = await requireDb();
    const duplicate = await db.select().from(contentInteractions).where(eq(contentInteractions.requestId, rid)).limit(1);
    if (duplicate[0]) return { active: duplicate[0].active, idempotent: true };
    const current = await db.select().from(contentInteractions).where(and(eq(contentInteractions.postId, postId), eq(contentInteractions.accountId, accountId), eq(contentInteractions.interactionType, type))).limit(1);
    const changed = current[0]?.active !== active;
    await db.transaction(async (tx) => {
      await tx.insert(contentInteractions).values({ postId, accountId, interactionType: type, active, requestId: rid }).onDuplicateKeyUpdate({ set: { active, requestId: rid } });
      if (changed) {
        const column = type === "like" ? contentMetrics.likeCount : contentMetrics.favoriteCount;
        await tx.update(contentMetrics).set({ [type === "like" ? "likeCount" : "favoriteCount"]: active ? sql`${column} + 1` : sql`greatest(${column} - 1, 0)` }).where(eq(contentMetrics.postId, postId));
        const profileColumn = type === "like" ? creatorProfiles.totalLikeCount : creatorProfiles.totalFavoriteCount;
        await tx.update(creatorProfiles).set({ [type === "like" ? "totalLikeCount" : "totalFavoriteCount"]: active ? sql`${profileColumn} + 1` : sql`greatest(${profileColumn} - 1, 0)` }).where(eq(creatorProfiles.accountId, post.authorAccountId));
      }
    });
    await audit(accountId, `content.${active ? "add" : "remove"}_${type}`, postId);
    return { active, idempotent: false };
  }

  async recordInteraction(accountId: number, postId: number, type: "view" | "share" | "product_click" | "listing_click" | "idea_click", ridValue: string) {
    const rid = requestId(ridValue);
    const post = await requireVisiblePost(postId, accountId);
    const db = await requireDb();
    const duplicate = await db.select({ id: contentInteractions.id }).from(contentInteractions).where(eq(contentInteractions.requestId, rid)).limit(1);
    if (duplicate[0]) return { recorded: false, idempotent: true };
    const metric = { view: "viewCount", share: "shareCount", product_click: "productClickCount", listing_click: "listingClickCount", idea_click: "ideaClickCount" }[type] as "viewCount" | "shareCount" | "productClickCount" | "listingClickCount" | "ideaClickCount";
    const column = contentMetrics[metric];
    await db.transaction(async (tx) => {
      await tx.insert(contentInteractions).values({ postId, accountId, interactionType: type, active: true, requestId: rid }).onDuplicateKeyUpdate({ set: { requestId: rid } });
      await tx.update(contentMetrics).set({ [metric]: sql`${column} + 1` }).where(eq(contentMetrics.postId, postId));
      const profileMetric = { view: "totalViewCount", share: null, product_click: "productClickCount", listing_click: "listingClickCount", idea_click: "ideaClickCount" }[type] as "totalViewCount" | "productClickCount" | "listingClickCount" | "ideaClickCount" | null;
      if (profileMetric) {
        const profileColumn = creatorProfiles[profileMetric];
        await tx.update(creatorProfiles).set({ [profileMetric]: sql`${profileColumn} + 1` }).where(eq(creatorProfiles.accountId, post.authorAccountId));
      }
    });
    await audit(accountId, `content.record_${type}`, postId);
    return { recorded: true, idempotent: false };
  }

  async addComment(accountId: number, postId: number, bodyValue: string, ridValue: string, parentCommentId?: number) {
    const rid = requestId(ridValue);
    const post = await requireVisiblePost(postId, accountId);
    if (!post.allowComments) throw new ContentServiceError("CONTENT_COMMENTS_DISABLED");
    const db = await requireDb();
    const duplicate = await db.select().from(contentComments).where(eq(contentComments.requestId, rid)).limit(1);
    if (duplicate[0]) return duplicate[0];
    const body = requiredText(bodyValue, 2000, "COMMENT_BODY_INVALID");
    if (parentCommentId) {
      const parent = await db.select({ id: contentComments.id }).from(contentComments).where(and(eq(contentComments.id, parentCommentId), eq(contentComments.postId, postId), eq(contentComments.status, "published"))).limit(1);
      if (!parent[0]) throw new ContentServiceError("PARENT_COMMENT_NOT_FOUND");
    }
    const inserted = await db.insert(contentComments).values({ postId, authorAccountId: accountId, body, parentCommentId: parentCommentId ?? null, requestId: rid });
    await db.update(contentMetrics).set({ commentCount: sql`${contentMetrics.commentCount} + 1` }).where(eq(contentMetrics.postId, postId));
    await db.update(creatorProfiles).set({ totalCommentCount: sql`${creatorProfiles.totalCommentCount} + 1` }).where(eq(creatorProfiles.accountId, post.authorAccountId));
    const rows = await db.select().from(contentComments).where(eq(contentComments.id, Number(inserted[0].insertId))).limit(1);
    await audit(accountId, "content.add_comment", postId, { commentId: rows[0]?.id });
    return rows[0];
  }

  async deleteComment(accountId: number, commentId: number, ridValue: string) {
    requestId(ridValue);
    const db = await requireDb();
    const rows = await db.select().from(contentComments).where(eq(contentComments.id, commentId)).limit(1);
    const comment = rows[0];
    if (!comment) throw new ContentServiceError("COMMENT_NOT_FOUND");
    if (comment.authorAccountId !== accountId) throw new ContentServiceError("COMMENT_DELETE_FORBIDDEN");
    if (comment.status === "author_deleted") return { deleted: true, idempotent: true };
    await db.transaction(async (tx) => {
      await tx.update(contentComments).set({ status: "author_deleted", deletedAt: new Date(), body: "" }).where(eq(contentComments.id, commentId));
      await tx.update(contentMetrics).set({ commentCount: sql`greatest(${contentMetrics.commentCount} - 1, 0)` }).where(eq(contentMetrics.postId, comment.postId));
      const posts = await tx.select({ authorAccountId: contentPosts.authorAccountId }).from(contentPosts).where(eq(contentPosts.id, comment.postId)).limit(1);
      if (posts[0]) await tx.update(creatorProfiles).set({ totalCommentCount: sql`greatest(${creatorProfiles.totalCommentCount} - 1, 0)` }).where(eq(creatorProfiles.accountId, posts[0].authorAccountId));
    });
    await audit(accountId, "content.delete_comment", comment.postId, { commentId });
    return { deleted: true, idempotent: false };
  }

  async setFollow(accountId: number, followedAccountId: number, active: boolean, ridValue: string) {
    const rid = requestId(ridValue);
    if (accountId === followedAccountId) throw new ContentServiceError("SELF_FOLLOW_FORBIDDEN");
    const db = await requireDb();
    const target = await db.select({ id: users.id }).from(users).where(and(eq(users.id, followedAccountId), eq(users.accountStatus, "active"))).limit(1);
    if (!target[0]) throw new ContentServiceError("AUTHOR_NOT_FOUND");
    const duplicate = await db.select().from(contentFollows).where(eq(contentFollows.requestId, rid)).limit(1);
    if (duplicate[0]) return { active: duplicate[0].active, idempotent: true };
    const current = await db.select().from(contentFollows).where(and(eq(contentFollows.followerAccountId, accountId), eq(contentFollows.followedAccountId, followedAccountId))).limit(1);
    const changed = current[0]?.active !== active;
    await db.transaction(async (tx) => {
      await tx.insert(contentFollows).values({ followerAccountId: accountId, followedAccountId, active, requestId: rid }).onDuplicateKeyUpdate({ set: { active, requestId: rid } });
      if (changed) {
        const delta = active ? sql`${creatorProfiles.followerCount} + 1` : sql`greatest(${creatorProfiles.followerCount} - 1, 0)`;
        await tx.update(creatorProfiles).set({ followerCount: delta }).where(eq(creatorProfiles.accountId, followedAccountId));
        const ownDelta = active ? sql`${creatorProfiles.followingCount} + 1` : sql`greatest(${creatorProfiles.followingCount} - 1, 0)`;
        await tx.update(creatorProfiles).set({ followingCount: ownDelta }).where(eq(creatorProfiles.accountId, accountId));
      }
    });
    await audit(accountId, `content.${active ? "follow" : "unfollow"}`, followedAccountId);
    return { active, idempotent: false };
  }

  async report(accountId: number, postId: number, reasonCodeValue: string, detail: string | undefined, ridValue: string) {
    const rid = requestId(ridValue);
    await requireVisiblePost(postId, accountId);
    const db = await requireDb();
    const duplicate = await db.select().from(contentReports).where(or(eq(contentReports.requestId, rid), and(eq(contentReports.postId, postId), eq(contentReports.reporterAccountId, accountId)))).limit(1);
    if (duplicate[0]) return duplicate[0];
    const inserted = await db.insert(contentReports).values({ postId, reporterAccountId: accountId, reasonCode: requiredText(reasonCodeValue, 64, "REPORT_REASON_INVALID"), detail: optionalText(detail, 1000, "REPORT_DETAIL_INVALID"), requestId: rid });
    const rows = await db.select().from(contentReports).where(eq(contentReports.id, Number(inserted[0].insertId))).limit(1);
    await audit(accountId, "content.report", postId, { reportId: rows[0]?.id, reasonCode: reasonCodeValue });
    return rows[0];
  }
}

export const contentService = new ContentService();
