import { and, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  businessIdentities,
  certifications,
  certificationTypes,
  fileAccessLogs,
  ideaAttachments,
  ideaCollaborationInvitations,
  ideaNdaAcceptances,
  ideas,
  identityProfiles,
  identityTypes,
  projectMembershipRoles,
  projectMemberships,
  projectRoles,
  projects,
  storedFiles,
  users,
} from "../../drizzle/schema";
import { applyFieldMask, getAuthorizationService } from "../authorization";
import type { AuthorizationRequest, AuthorizationResult } from "../authorization";
import { createNotification, requireDb } from "../db";
import {
  assertIdeaTransition,
  ideaInvitationDedupeKey,
  ideaNotification,
  IDEA_NDA_TEMPLATE,
  IDEA_NDA_VERSION,
  projectRoleForIdeaRole,
  requiredCertificationForRole,
  roleIdentityType,
  type IdeaNotificationEvent,
  type IdeaRequestedRole,
  IDEA_VISIBLE_STATUSES,
  redactIdeaBeforeNda,
  type IdeaVisibility,
} from "./idea-domain";

export interface IdeaAuthorizationPort {
  authorize(accountId: number, request: Omit<AuthorizationRequest, "accountId">): Promise<AuthorizationResult>;
}

export interface IdeaNotificationPort {
  notify(input: {
    recipientAccountId: number;
    event: IdeaNotificationEvent;
    ideaId: number;
    ideaTitle: string;
    dedupeKey: string;
  }): Promise<void>;
}

export interface IdeaClockPort { now(): Date }

const runtimeAuthorization: IdeaAuthorizationPort = {
  authorize: (accountId, request) => getAuthorizationService().authorize({ accountId, ...request }),
};

const runtimeNotifications: IdeaNotificationPort = {
  async notify(input) {
    const message = ideaNotification(input.event, input.ideaTitle);
    await createNotification({
      userId: input.recipientAccountId,
      category: "system",
      title: message.title,
      content: message.content,
      refType: "idea",
      refId: input.ideaId,
      dedupeKey: input.dedupeKey,
    });
  },
};

const runtimeClock: IdeaClockPort = { now: () => new Date() };

export interface IdeaDraftInput {
  creatorIdentityId: number;
  title: string;
  summary: string;
  description: string;
  categoryCode: string;
  tags?: string[];
  visibility?: IdeaVisibility;
}

export interface IdeaDraftUpdate {
  title?: string;
  summary?: string;
  description?: string;
  categoryCode?: string;
  tags?: string[];
  visibility?: IdeaVisibility;
  expectedAuthorizationVersion?: number;
}

export interface IdeaPublicCursor {
  publishedAt: string;
  id: number;
}

export interface IdeaListOptions {
  limit?: number;
  cursor?: number;
}

export interface IdeaPublicListOptions {
  limit?: number;
  cursor?: IdeaPublicCursor;
}

export interface IdeaAttachmentInput {
  fileId: number;
  attachmentType: "cover" | "reference" | "design" | "other";
  confidentialityLevel: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "NDA" | "RESTRICTED";
  sortOrder?: number;
  requestId: string;
}

export interface IdeaInvitationInput {
  invitedAccountId: number;
  invitedIdentityId: number;
  requestedRole: IdeaRequestedRole;
  message?: string;
  ndaRequired?: boolean;
  expiresAt: Date;
  requestId: string;
}

export interface IdeaInvitationListOptions {
  direction: "received" | "sent";
  ideaId?: number;
  status?: "pending" | "accepted" | "declined" | "revoked" | "expired";
  limit?: number;
  cursor?: number;
}

export type IdeaDetailResult =
  | { limited: true; ndaRequired: true; idea: Record<string, unknown>; attachments: [] }
  | { limited: false; ndaRequired: boolean; idea: Record<string, unknown>; attachments: Record<string, unknown>[] };

export class IdeaServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IdeaServiceError";
  }
}

function cleanText(value: string, code: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new IdeaServiceError(code);
  return result;
}

function normalizedTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function limitValue(value: number | undefined): number {
  return Math.min(50, Math.max(1, value ?? 20));
}

export function invitationRelationshipActive(status: string, expiresAt: Date, now: Date): boolean {
  return status === "accepted" || (status === "pending" && expiresAt.getTime() > now.getTime());
}

export function publicIdeaIsAfterCursor(
  row: { publishedAt: Date | null; id: number },
  cursor: IdeaPublicCursor,
): boolean {
  if (!row.publishedAt) return false;
  const cursorTime = new Date(cursor.publishedAt).getTime();
  return row.publishedAt.getTime() < cursorTime || (row.publishedAt.getTime() === cursorTime && row.id < cursor.id);
}

function publicSummary(row: typeof ideas.$inferSelect) {
  return {
    id: row.id,
    creatorAccountId: row.creatorAccountId,
    creatorIdentityId: row.creatorIdentityId,
    title: row.title,
    summary: row.summary,
    categoryCode: row.categoryCode,
    tags: row.tags,
    visibility: row.visibility,
    status: row.status,
    coverFileId: row.coverFileId,
    publishedAt: row.publishedAt,
    convertedProjectId: row.convertedProjectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireAllowed(
  authorization: IdeaAuthorizationPort,
  accountId: number,
  request: Omit<AuthorizationRequest, "accountId">,
): Promise<AuthorizationResult> {
  const result = await authorization.authorize(accountId, request);
  if (!result.allowed) throw new IdeaServiceError(result.reasonCode);
  return result;
}

export class IdeaService {
  constructor(
    private readonly authorization: IdeaAuthorizationPort = runtimeAuthorization,
    private readonly notifications: IdeaNotificationPort = runtimeNotifications,
    private readonly clock: IdeaClockPort = runtimeClock,
  ) {}

  private async notifySafely(input: Parameters<IdeaNotificationPort["notify"]>[0]): Promise<void> {
    try { await this.notifications.notify(input); } catch { /* Notification delivery never rolls back committed business state. */ }
  }

  async createDraft(accountId: number, input: IdeaDraftInput, requestId?: string | null) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.create",
      identityId: input.creatorIdentityId,
      purpose: "idea_create_draft",
      requestId,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [identity] = await tx.select({
        id: businessIdentities.id,
        accountId: businessIdentities.accountId,
        status: businessIdentities.status,
      }).from(businessIdentities).where(and(
        eq(businessIdentities.id, input.creatorIdentityId),
        eq(businessIdentities.accountId, accountId),
      )).for("update").limit(1);
      if (!identity || identity.status !== "active") throw new IdeaServiceError("IDENTITY_INACTIVE");

      const result = await tx.insert(ideas).values({
        creatorAccountId: accountId,
        creatorIdentityId: identity.id,
        title: cleanText(input.title, "IDEA_TITLE_INVALID", 160),
        summary: cleanText(input.summary, "IDEA_SUMMARY_INVALID", 500),
        description: cleanText(input.description, "IDEA_DESCRIPTION_INVALID", 20_000),
        categoryCode: cleanText(input.categoryCode, "IDEA_CATEGORY_INVALID", 64),
        tags: normalizedTags(input.tags),
        visibility: input.visibility ?? "public",
        status: "draft",
      });
      const [created] = await tx.select().from(ideas).where(eq(ideas.id, Number(result[0].insertId))).limit(1);
      if (!created) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return created;
    });
  }

  async updateDraft(accountId: number, ideaId: number, input: IdeaDraftUpdate, requestId?: string | null) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.edit",
      identityId: null,
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_update_draft",
      requestId,
      expectedResourceVersion: input.expectedAuthorizationVersion,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!current || current.creatorAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (current.status !== "draft") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      if (input.expectedAuthorizationVersion != null && current.authorizationVersion !== input.expectedAuthorizationVersion) {
        throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      }
      const changes = {
        ...(input.title !== undefined ? { title: cleanText(input.title, "IDEA_TITLE_INVALID", 160) } : {}),
        ...(input.summary !== undefined ? { summary: cleanText(input.summary, "IDEA_SUMMARY_INVALID", 500) } : {}),
        ...(input.description !== undefined ? { description: cleanText(input.description, "IDEA_DESCRIPTION_INVALID", 20_000) } : {}),
        ...(input.categoryCode !== undefined ? { categoryCode: cleanText(input.categoryCode, "IDEA_CATEGORY_INVALID", 64) } : {}),
        ...(input.tags !== undefined ? { tags: normalizedTags(input.tags) } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        authorizationVersion: current.authorizationVersion + 1,
      };
      await tx.update(ideas).set(changes).where(and(eq(ideas.id, ideaId), eq(ideas.authorizationVersion, current.authorizationVersion)));
      const [updated] = await tx.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1);
      if (!updated || updated.authorizationVersion !== current.authorizationVersion + 1) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return updated;
    });
  }

  async publish(accountId: number, ideaId: number, expectedAuthorizationVersion?: number, requestId?: string | null) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.publish",
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_publish",
      requestId,
      expectedResourceVersion: expectedAuthorizationVersion,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!current || current.creatorAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (current.status === "published") return current;
      if (current.status !== "draft") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      if (expectedAuthorizationVersion != null && current.authorizationVersion !== expectedAuthorizationVersion) {
        throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      }
      const nextVersion = current.authorizationVersion + 1;
      await tx.update(ideas).set({
        status: "published",
        publishedAt: new Date(),
        authorizationVersion: nextVersion,
      }).where(and(eq(ideas.id, ideaId), eq(ideas.authorizationVersion, current.authorizationVersion)));
      const [published] = await tx.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1);
      if (!published || published.authorizationVersion !== nextVersion) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return published;
    });
  }

  async listPublic(accountId: number, options: IdeaPublicListOptions = {}, requestId?: string | null) {
    const authorization = await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.view_public",
      purpose: "idea_list_public",
      requestId,
      view: "list",
      requestedFields: ["id", "creatorAccountId", "creatorIdentityId", "title", "summary", "categoryCode", "tags", "visibility", "status", "coverFileId", "publishedAt", "convertedProjectId", "createdAt", "updatedAt"],
    });
    const db = await requireDb();
    const conditions = [
      eq(ideas.visibility, "public"),
      inArray(ideas.status, [...IDEA_VISIBLE_STATUSES] as ("published" | "collaborating" | "converted")[]),
      isNull(ideas.deletedAt),
    ];
    if (options.cursor) {
      const publishedAt = new Date(options.cursor.publishedAt);
      if (!Number.isFinite(publishedAt.getTime()) || !Number.isSafeInteger(options.cursor.id) || options.cursor.id <= 0) {
        throw new IdeaServiceError("CURSOR_INVALID");
      }
      conditions.push(or(
        lt(ideas.publishedAt, publishedAt),
        and(eq(ideas.publishedAt, publishedAt), lt(ideas.id, options.cursor.id)),
      )!);
    }
    const rows = await db.select().from(ideas).where(and(...conditions)).orderBy(desc(ideas.publishedAt), desc(ideas.id)).limit(limitValue(options.limit));
    return rows.map((row) => applyFieldMask(publicSummary(row) as Record<string, unknown>, authorization.fieldMask));
  }

  async listMine(accountId: number, options: IdeaListOptions = {}, requestId?: string | null) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.view_private",
      purpose: "idea_list_mine",
      requestId,
      view: "list",
    });
    const db = await requireDb();
    const conditions = [eq(ideas.creatorAccountId, accountId), isNull(ideas.deletedAt)];
    if (options.cursor != null) conditions.push(lt(ideas.id, options.cursor));
    return db.select().from(ideas).where(and(...conditions)).orderBy(desc(ideas.updatedAt), desc(ideas.id)).limit(limitValue(options.limit));
  }

  async detail(accountId: number, ideaId: number, requestId?: string | null): Promise<IdeaDetailResult> {
    const db = await requireDb();
    const [idea] = await db.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).limit(1);
    if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");

    const owner = idea.creatorAccountId === accountId;
    const invitationRows = owner ? [] : await db.select({
      id: ideaCollaborationInvitations.id,
      status: ideaCollaborationInvitations.status,
      expiresAt: ideaCollaborationInvitations.expiresAt,
      identityId: ideaCollaborationInvitations.invitedIdentityId,
    }).from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.ideaId, idea.id),
      eq(ideaCollaborationInvitations.invitedAccountId, accountId),
      inArray(ideaCollaborationInvitations.status, ["pending", "accepted"]),
    ));
    const now = this.clock.now();
    const validInvitations = invitationRows.filter((invitation) => invitationRelationshipActive(invitation.status, invitation.expiresAt, now));
    const acceptedCollaborator = validInvitations.some((invitation) => invitation.status === "accepted");
    const invitedForNda = validInvitations.length > 0;

    if (idea.status === "draft" && !owner) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    if (idea.visibility === "private" && !owner && !acceptedCollaborator) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    if (idea.visibility === "nda" && !owner && !invitedForNda) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");

    const capabilityCode = idea.visibility === "public" && idea.status !== "draft" ? "idea.view_public" : "idea.view_private";
    const authorization = await this.authorization.authorize(accountId, {
      capabilityCode,
      identityId: validInvitations[0]?.identityId ?? (owner ? idea.creatorIdentityId : null),
      resourceType: "idea",
      resourceId: String(idea.id),
      purpose: "idea_detail",
      requestId,
      view: "detail",
    });

    const [nda] = owner || idea.visibility !== "nda" ? [true] : await db.select({ id: ideaNdaAcceptances.id }).from(ideaNdaAcceptances).where(and(
      eq(ideaNdaAcceptances.ideaId, idea.id),
      eq(ideaNdaAcceptances.accountId, accountId),
      isNull(ideaNdaAcceptances.revokedAt),
    )).limit(1);
    const ndaAccepted = owner || idea.visibility !== "nda" || Boolean(nda);

    if (!authorization.allowed && !(idea.visibility === "nda" && !ndaAccepted && authorization.reasonCode === "NDA_REQUIRED")) {
      throw new IdeaServiceError(authorization.reasonCode);
    }
    if (idea.visibility === "nda" && !ndaAccepted) {
      return {
        limited: true,
        ndaRequired: true,
        idea: applyFieldMask(redactIdeaBeforeNda(publicSummary(idea) as Record<string, unknown>), authorization.fieldMask) as Record<string, unknown>,
        attachments: [],
      };
    }

    const attachments = await db.select({
      id: ideaAttachments.id,
      ideaId: ideaAttachments.ideaId,
      fileId: ideaAttachments.fileId,
      attachmentType: ideaAttachments.attachmentType,
      confidentialityLevel: ideaAttachments.confidentialityLevel,
      sortOrder: ideaAttachments.sortOrder,
      accessPolicyVersion: ideaAttachments.accessPolicyVersion,
      originalName: storedFiles.originalName,
      mimeType: storedFiles.mimeType,
      sizeBytes: storedFiles.sizeBytes,
      createdAt: ideaAttachments.createdAt,
    }).from(ideaAttachments).innerJoin(storedFiles, eq(storedFiles.id, ideaAttachments.fileId)).where(and(
      eq(ideaAttachments.ideaId, idea.id),
      isNull(ideaAttachments.disabledAt),
      eq(storedFiles.status, "available"),
    )).orderBy(ideaAttachments.sortOrder, ideaAttachments.id);

    return {
      limited: false,
      ndaRequired: idea.visibility === "nda",
      idea: applyFieldMask({ ...idea } as Record<string, unknown>, authorization.fieldMask) as Record<string, unknown>,
      attachments: attachments.map((attachment) => applyFieldMask(attachment as Record<string, unknown>, authorization.fieldMask) as Record<string, unknown>),
    };
  }

  async archive(accountId: number, ideaId: number, requestId?: string | null) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).limit(1);
    if (!snapshot || snapshot.creatorAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    const authorization = await this.authorization.authorize(accountId, {
      capabilityCode: "idea.archive",
      identityId: snapshot.creatorIdentityId,
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_archive",
      requestId,
      expectedResourceVersion: snapshot.authorizationVersion,
    });
    if (!authorization.allowed && !(snapshot.status === "archived" && authorization.reasonCode === "RESOURCE_STATE_FORBIDDEN")) {
      throw new IdeaServiceError(authorization.reasonCode);
    }
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!current || current.creatorAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (current.status === "archived") return { ...current, duplicate: true };
      assertIdeaTransition(current.status, "archived");
      await tx.update(ideas).set({ status: "archived", authorizationVersion: current.authorizationVersion + 1 })
        .where(and(eq(ideas.id, ideaId), eq(ideas.authorizationVersion, current.authorizationVersion)));
      const [archived] = await tx.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1);
      if (!archived || archived.authorizationVersion !== current.authorizationVersion + 1) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return { ...archived, duplicate: false };
    });
  }

  async uploadAttachment(accountId: number, ideaId: number, input: IdeaAttachmentInput) {
    const authorization = await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.attachment.upload",
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_attachment_upload",
      requestId: input.requestId,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!idea || idea.status === "archived") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const owner = idea.creatorAccountId === accountId;
      const [collaboration] = owner ? [] : await tx.select({ id: ideaCollaborationInvitations.id }).from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId),
        eq(ideaCollaborationInvitations.invitedAccountId, accountId),
        eq(ideaCollaborationInvitations.status, "accepted"),
      )).limit(1);
      if (!owner && !collaboration) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (!authorization.allowed) throw new IdeaServiceError(authorization.reasonCode);

      const [file] = await tx.select().from(storedFiles).where(eq(storedFiles.id, input.fileId)).for("update").limit(1);
      if (!file || file.status !== "available" || file.ownerId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      const [existing] = await tx.select().from(ideaAttachments).where(and(
        eq(ideaAttachments.ideaId, ideaId), eq(ideaAttachments.fileId, input.fileId),
      )).for("update").limit(1);
      if (existing && !existing.disabledAt) return { ...existing, duplicate: true };
      if (existing?.disabledAt) {
        const nextPolicyVersion = existing.accessPolicyVersion + 1;
        await tx.update(ideaAttachments).set({
          disabledAt: null,
          attachmentType: input.attachmentType,
          confidentialityLevel: idea.visibility === "nda" && input.confidentialityLevel === "PUBLIC" ? "NDA" : input.confidentialityLevel,
          sortOrder: Math.max(0, Math.min(10_000, input.sortOrder ?? 0)),
          uploadedBy: accountId,
          accessPolicyVersion: nextPolicyVersion,
        }).where(and(eq(ideaAttachments.id, existing.id), eq(ideaAttachments.accessPolicyVersion, existing.accessPolicyVersion)));
        await tx.update(ideas).set({
          ...(input.attachmentType === "cover" ? { coverFileId: input.fileId } : {}),
          authorizationVersion: idea.authorizationVersion + 1,
        }).where(and(eq(ideas.id, ideaId), eq(ideas.authorizationVersion, idea.authorizationVersion)));
        await tx.insert(fileAccessLogs).values({
          fileId: input.fileId, userId: accountId, action: "upload", relatedEntityType: "idea", relatedEntityId: ideaId,
          result: "success", reason: `reactivated;request:${input.requestId.slice(0, 160)}`,
        });
        return { ...existing, disabledAt: null, accessPolicyVersion: nextPolicyVersion, uploadedBy: accountId, duplicate: false, reactivated: true };
      }

      const result = await tx.insert(ideaAttachments).values({
        ideaId,
        fileId: input.fileId,
        attachmentType: input.attachmentType,
        confidentialityLevel: idea.visibility === "nda" && input.confidentialityLevel === "PUBLIC" ? "NDA" : input.confidentialityLevel,
        sortOrder: Math.max(0, Math.min(10_000, input.sortOrder ?? 0)),
        uploadedBy: accountId,
      });
      const attachmentId = Number(result[0].insertId);
      await tx.update(ideas).set({
        ...(input.attachmentType === "cover" ? { coverFileId: input.fileId } : {}),
        authorizationVersion: idea.authorizationVersion + 1,
      }).where(and(eq(ideas.id, ideaId), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      await tx.insert(fileAccessLogs).values({
        fileId: input.fileId,
        userId: accountId,
        action: "upload",
        relatedEntityType: "idea",
        relatedEntityId: ideaId,
        result: "success",
        reason: `request:${input.requestId.slice(0, 180)}`,
      });
      const [created] = await tx.select().from(ideaAttachments).where(eq(ideaAttachments.id, attachmentId)).limit(1);
      if (!created) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return { ...created, duplicate: false };
    });
  }

  async disableAttachment(accountId: number, ideaId: number, attachmentId: number, requestId: string) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.attachment.upload",
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_attachment_disable",
      requestId,
    });
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      const [attachment] = await tx.select().from(ideaAttachments).where(and(
        eq(ideaAttachments.id, attachmentId), eq(ideaAttachments.ideaId, ideaId),
      )).for("update").limit(1);
      if (!idea || !attachment) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      const owner = idea.creatorAccountId === accountId;
      const [collaboration] = owner ? [] : await tx.select({ id: ideaCollaborationInvitations.id }).from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId),
        eq(ideaCollaborationInvitations.invitedAccountId, accountId),
        eq(ideaCollaborationInvitations.status, "accepted"),
      )).limit(1);
      if (!owner && !collaboration) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (attachment.disabledAt) return { ...attachment, duplicate: true };
      const disabledAt = this.clock.now();
      await tx.update(ideaAttachments).set({
        disabledAt,
        accessPolicyVersion: attachment.accessPolicyVersion + 1,
      }).where(and(eq(ideaAttachments.id, attachment.id), isNull(ideaAttachments.disabledAt)));
      await tx.update(ideas).set({
        ...(idea.coverFileId === attachment.fileId ? { coverFileId: null } : {}),
        authorizationVersion: idea.authorizationVersion + 1,
      }).where(and(eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      await tx.insert(fileAccessLogs).values({
        fileId: attachment.fileId,
        userId: accountId,
        action: "disable",
        relatedEntityType: "idea",
        relatedEntityId: ideaId,
        result: "success",
        reason: `disabledBy:${accountId};request:${requestId.slice(0, 150)}`,
      });
      return { ...attachment, disabledAt, accessPolicyVersion: attachment.accessPolicyVersion + 1, duplicate: false };
    });
  }

  async inviteCollaborator(accountId: number, ideaId: number, input: IdeaInvitationInput) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.collaborator.invite",
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_collaborator_invite",
      requestId: input.requestId,
    });
    if (input.invitedAccountId === accountId) throw new IdeaServiceError("SELF_APPROVAL_FORBIDDEN");
    const now = this.clock.now();
    if (input.expiresAt.getTime() <= now.getTime()) throw new IdeaServiceError("INVITATION_EXPIRED");
    const db = await requireDb();
    const stored = await db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!idea || idea.status === "draft" || idea.status === "archived" || idea.status === "converted") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const owner = idea.creatorAccountId === accountId;
      const [manager] = owner ? [] : await tx.select({ id: ideaCollaborationInvitations.id }).from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId),
        eq(ideaCollaborationInvitations.invitedAccountId, accountId),
        eq(ideaCollaborationInvitations.status, "accepted"),
      )).limit(1);
      if (!owner && !manager) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");

      const [target] = await tx.select({ id: users.id, status: users.accountStatus }).from(users)
        .where(eq(users.id, input.invitedAccountId)).for("update").limit(1);
      if (!target || target.status !== "active") throw new IdeaServiceError("ACCOUNT_INACTIVE");
      const [identity] = await tx.select({
        id: businessIdentities.id,
        accountId: businessIdentities.accountId,
        status: businessIdentities.status,
        typeCode: identityTypes.code,
      }).from(businessIdentities).innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId)).where(and(
        eq(businessIdentities.id, input.invitedIdentityId),
        eq(businessIdentities.accountId, input.invitedAccountId),
        isNull(identityTypes.deletedAt),
      )).limit(1);
      const requiredType = roleIdentityType(input.requestedRole);
      if (!identity || identity.status !== "active" || (requiredType && identity.typeCode !== requiredType)) {
        throw new IdeaServiceError("IDENTITY_INACTIVE");
      }
      const dedupeKey = ideaInvitationDedupeKey(ideaId, input.invitedAccountId, input.invitedIdentityId, input.requestedRole);
      const [byRequest] = await tx.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.requestId, input.requestId)).limit(1);
      if (byRequest) {
        if (byRequest.ideaId !== ideaId || byRequest.invitedAccountId !== input.invitedAccountId || byRequest.requestedRole !== input.requestedRole) {
          throw new IdeaServiceError("IDEMPOTENCY_CONFLICT");
        }
        return { idea, invitation: byRequest, duplicate: true };
      }
      const [existing] = await tx.select().from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId),
        eq(ideaCollaborationInvitations.invitedAccountId, input.invitedAccountId),
        eq(ideaCollaborationInvitations.requestedRole, input.requestedRole),
        inArray(ideaCollaborationInvitations.status, ["pending", "accepted"]),
      )).limit(1);
      if (existing) return { idea, invitation: existing, duplicate: true };

      const result = await tx.insert(ideaCollaborationInvitations).values({
        ideaId,
        inviterAccountId: accountId,
        invitedAccountId: input.invitedAccountId,
        invitedIdentityId: input.invitedIdentityId,
        requestedRole: input.requestedRole,
        activeDedupeKey: dedupeKey,
        message: input.message?.trim().slice(0, 1000),
        ndaRequired: idea.visibility === "nda" ? true : Boolean(input.ndaRequired),
        expiresAt: input.expiresAt,
        requestId: input.requestId,
      });
      const [invitation] = await tx.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, Number(result[0].insertId))).limit(1);
      if (!invitation) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      return { idea, invitation, duplicate: false };
    });
    if (!stored.duplicate) await this.notifySafely({
      recipientAccountId: stored.invitation.invitedAccountId,
      event: "invited",
      ideaId,
      ideaTitle: stored.idea.title,
      dedupeKey: `idea:${ideaId}:invitation:${stored.invitation.id}:created`,
    });
    return { ...stored.invitation, duplicate: stored.duplicate };
  }

  async listInvitations(accountId: number, options: IdeaInvitationListOptions, requestId?: string | null) {
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: options.direction === "received" ? "idea.invitation.accept" : "idea.collaborator.invite",
      resourceType: options.ideaId == null ? null : "idea",
      resourceId: options.ideaId == null ? null : String(options.ideaId),
      purpose: `idea_invitations_${options.direction}`,
      requestId,
      view: "list",
    });
    const db = await requireDb();
    const now = this.clock.now();
    const ownership = options.direction === "received"
      ? eq(ideaCollaborationInvitations.invitedAccountId, accountId)
      : options.ideaId == null
        ? eq(ideaCollaborationInvitations.inviterAccountId, accountId)
        : eq(ideaCollaborationInvitations.ideaId, options.ideaId);
    await db.update(ideaCollaborationInvitations).set({
      status: "expired",
      activeDedupeKey: null,
      version: sql`${ideaCollaborationInvitations.version} + 1`,
    }).where(and(ownership, eq(ideaCollaborationInvitations.status, "pending"), lte(ideaCollaborationInvitations.expiresAt, now)));

    const conditions = [ownership];
    if (options.ideaId != null) conditions.push(eq(ideaCollaborationInvitations.ideaId, options.ideaId));
    if (options.status != null) conditions.push(eq(ideaCollaborationInvitations.status, options.status));
    if (options.cursor != null) conditions.push(lt(ideaCollaborationInvitations.id, options.cursor));
    return db.select({
      id: ideaCollaborationInvitations.id,
      ideaId: ideaCollaborationInvitations.ideaId,
      ideaTitle: ideas.title,
      inviterAccountId: ideaCollaborationInvitations.inviterAccountId,
      invitedAccountId: ideaCollaborationInvitations.invitedAccountId,
      invitedIdentityId: ideaCollaborationInvitations.invitedIdentityId,
      requestedRole: ideaCollaborationInvitations.requestedRole,
      status: ideaCollaborationInvitations.status,
      message: ideaCollaborationInvitations.message,
      ndaRequired: ideaCollaborationInvitations.ndaRequired,
      expiresAt: ideaCollaborationInvitations.expiresAt,
      acceptedAt: ideaCollaborationInvitations.acceptedAt,
      createdAt: ideaCollaborationInvitations.createdAt,
    }).from(ideaCollaborationInvitations).innerJoin(ideas, eq(ideas.id, ideaCollaborationInvitations.ideaId))
      .where(and(...conditions)).orderBy(desc(ideaCollaborationInvitations.id)).limit(limitValue(options.limit));
  }

  async acceptInvitation(accountId: number, invitationId: number, requestId: string) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, invitationId)).limit(1);
    if (!snapshot || snapshot.invitedAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.invitation.accept",
      identityId: snapshot.invitedIdentityId,
      resourceType: "idea",
      resourceId: String(snapshot.ideaId),
      purpose: "idea_invitation_accept",
      requestId,
    });
    const outcome = await db.transaction(async (tx) => {
      const [invitation] = await tx.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, invitationId)).for("update").limit(1);
      if (!invitation || invitation.invitedAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      const [idea] = await tx.select().from(ideas).where(eq(ideas.id, invitation.ideaId)).for("update").limit(1);
      if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (invitation.status === "accepted") return { invitation, idea, duplicate: true, expired: false };
      if (invitation.status !== "pending") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const now = this.clock.now();
      if (invitation.expiresAt.getTime() <= now.getTime()) {
        await tx.update(ideaCollaborationInvitations).set({ status: "expired", activeDedupeKey: null, version: invitation.version + 1 })
          .where(and(eq(ideaCollaborationInvitations.id, invitation.id), eq(ideaCollaborationInvitations.version, invitation.version)));
        return { invitation: { ...invitation, status: "expired" as const }, idea, duplicate: false, expired: true };
      }
      const [identity] = await tx.select({
        id: businessIdentities.id,
        accountId: businessIdentities.accountId,
        status: businessIdentities.status,
        typeCode: identityTypes.code,
      }).from(businessIdentities).innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId)).where(and(
        eq(businessIdentities.id, invitation.invitedIdentityId),
        eq(businessIdentities.accountId, accountId),
      )).limit(1);
      const requiredType = roleIdentityType(invitation.requestedRole);
      if (!identity || identity.status !== "active" || (requiredType && identity.typeCode !== requiredType)) throw new IdeaServiceError("IDENTITY_INACTIVE");
      const certificationCode = requiredCertificationForRole(invitation.requestedRole);
      if (certificationCode) {
        const [certification] = await tx.select({ id: certifications.id }).from(certifications)
          .innerJoin(certificationTypes, eq(certificationTypes.id, certifications.certificationTypeId)).where(and(
            eq(certifications.subjectIdentityId, identity.id),
            eq(certificationTypes.code, certificationCode),
            eq(certifications.status, "approved"),
            or(isNull(certifications.expiresAt), gt(certifications.expiresAt, now)),
          )).limit(1);
        if (!certification) throw new IdeaServiceError("CERTIFICATION_INACTIVE");
      }
      const acceptedAt = now;
      await tx.update(ideaCollaborationInvitations).set({
        status: "accepted",
        acceptedAt,
        version: invitation.version + 1,
      }).where(and(
        eq(ideaCollaborationInvitations.id, invitation.id),
        eq(ideaCollaborationInvitations.status, "pending"),
        eq(ideaCollaborationInvitations.version, invitation.version),
      ));
      if (idea.status === "published") {
        await tx.update(ideas).set({ status: "collaborating", authorizationVersion: idea.authorizationVersion + 1 })
          .where(and(eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      }
      return { invitation: { ...invitation, status: "accepted" as const, acceptedAt, version: invitation.version + 1 }, idea, duplicate: false, expired: false };
    });
    if (outcome.expired) throw new IdeaServiceError("INVITATION_EXPIRED");
    if (!outcome.duplicate) await this.notifySafely({
      recipientAccountId: outcome.idea.creatorAccountId,
      event: "accepted",
      ideaId: outcome.idea.id,
      ideaTitle: outcome.idea.title,
      dedupeKey: `idea:${outcome.idea.id}:invitation:${invitationId}:accepted`,
    });
    return { ...outcome.invitation, duplicate: outcome.duplicate, ndaAccepted: false };
  }

  async declineInvitation(accountId: number, invitationId: number, requestId: string) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, invitationId)).limit(1);
    if (!snapshot || snapshot.invitedAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.invitation.accept",
      identityId: snapshot.invitedIdentityId,
      resourceType: "idea",
      resourceId: String(snapshot.ideaId),
      purpose: "idea_invitation_decline",
      requestId,
    });
    const outcome = await db.transaction(async (tx) => {
      const [invitation] = await tx.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, invitationId)).for("update").limit(1);
      if (!invitation || invitation.invitedAccountId !== accountId) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      const [idea] = await tx.select().from(ideas).where(eq(ideas.id, invitation.ideaId)).for("update").limit(1);
      if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (invitation.status === "declined") return { invitation, idea, duplicate: true, expired: false };
      if (invitation.status !== "pending") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const now = this.clock.now();
      if (invitation.expiresAt.getTime() <= now.getTime()) {
        await tx.update(ideaCollaborationInvitations).set({
          status: "expired", activeDedupeKey: null, version: invitation.version + 1,
        }).where(and(
          eq(ideaCollaborationInvitations.id, invitation.id),
          eq(ideaCollaborationInvitations.status, "pending"),
          eq(ideaCollaborationInvitations.version, invitation.version),
        ));
        return { invitation: { ...invitation, status: "expired" as const }, idea, duplicate: false, expired: true };
      }
      await tx.update(ideaCollaborationInvitations).set({
        status: "declined", activeDedupeKey: null, version: invitation.version + 1,
      }).where(and(
        eq(ideaCollaborationInvitations.id, invitation.id),
        eq(ideaCollaborationInvitations.status, "pending"),
        eq(ideaCollaborationInvitations.version, invitation.version),
      ));
      await tx.update(ideas).set({ authorizationVersion: idea.authorizationVersion + 1 })
        .where(and(eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      return { invitation: { ...invitation, status: "declined" as const, activeDedupeKey: null, version: invitation.version + 1 }, idea, duplicate: false, expired: false };
    });
    if (outcome.expired) throw new IdeaServiceError("INVITATION_EXPIRED");
    if (!outcome.duplicate) await this.notifySafely({
      recipientAccountId: outcome.invitation.inviterAccountId,
      event: "declined",
      ideaId: outcome.idea.id,
      ideaTitle: outcome.idea.title,
      dedupeKey: `idea:${outcome.idea.id}:invitation:${invitationId}:declined`,
    });
    return { ...outcome.invitation, duplicate: outcome.duplicate };
  }

  async revokeInvitation(accountId: number, ideaId: number, invitationId: number, requestId: string) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.id, invitationId), eq(ideaCollaborationInvitations.ideaId, ideaId),
    )).limit(1);
    if (!snapshot) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.collaborator.invite",
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_invitation_revoke",
      requestId,
    });
    const outcome = await db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId)).for("update").limit(1);
      const [invitation] = await tx.select().from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.id, invitationId), eq(ideaCollaborationInvitations.ideaId, ideaId),
      )).for("update").limit(1);
      if (!idea || !invitation) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      const ownerOrInviter = idea.creatorAccountId === accountId || invitation.inviterAccountId === accountId;
      const [manager] = ownerOrInviter ? [] : await tx.select({ id: ideaCollaborationInvitations.id }).from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId),
        eq(ideaCollaborationInvitations.invitedAccountId, accountId),
        eq(ideaCollaborationInvitations.status, "accepted"),
      )).limit(1);
      if (!ownerOrInviter && !manager) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (invitation.status === "revoked") return { invitation, idea, duplicate: true, wasAccepted: false };
      if (invitation.status !== "pending" && invitation.status !== "accepted") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const wasAccepted = invitation.status === "accepted";
      await tx.update(ideaCollaborationInvitations).set({
        status: "revoked", activeDedupeKey: null, version: invitation.version + 1,
      }).where(and(
        eq(ideaCollaborationInvitations.id, invitation.id),
        eq(ideaCollaborationInvitations.status, invitation.status),
        eq(ideaCollaborationInvitations.version, invitation.version),
      ));
      await tx.update(ideas).set({ authorizationVersion: idea.authorizationVersion + 1 })
        .where(and(eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      return {
        invitation: { ...invitation, status: "revoked" as const, activeDedupeKey: null, version: invitation.version + 1 },
        idea: { ...idea, authorizationVersion: idea.authorizationVersion + 1 },
        duplicate: false,
        wasAccepted,
      };
    });
    if (!outcome.duplicate) await this.notifySafely({
      recipientAccountId: outcome.invitation.invitedAccountId,
      event: "revoked",
      ideaId,
      ideaTitle: outcome.idea.title,
      dedupeKey: `idea:${ideaId}:invitation:${invitationId}:revoked`,
    });
    return { ...outcome.invitation, duplicate: outcome.duplicate, authorizationVersion: outcome.idea.authorizationVersion, accessRevoked: outcome.wasAccepted };
  }

  async getNda(accountId: number, ideaId: number, requestId?: string | null) {
    const db = await requireDb();
    const [idea] = await db.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).limit(1);
    if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    const owner = idea.creatorAccountId === accountId;
    const invitations = owner ? await db.select().from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.ideaId, ideaId),
      eq(ideaCollaborationInvitations.ndaRequired, true),
      inArray(ideaCollaborationInvitations.status, ["pending", "accepted"]),
    )) : await db.select().from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.ideaId, ideaId),
      eq(ideaCollaborationInvitations.invitedAccountId, accountId),
      inArray(ideaCollaborationInvitations.status, ["pending", "accepted"]),
    ));
    const now = this.clock.now();
    const validInvitation = invitations.find((item) => invitationRelationshipActive(item.status, item.expiresAt, now));
    const ndaRequired = idea.visibility === "nda" || Boolean(validInvitation?.ndaRequired) || (owner && invitations.length > 0);
    if (!ndaRequired || (!owner && !validInvitation)) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: owner ? "idea.view_private" : "idea.nda.accept",
      identityId: owner ? idea.creatorIdentityId : validInvitation?.invitedIdentityId,
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_nda_read",
      requestId,
    });
    const [acceptance] = owner ? [] : await db.select().from(ideaNdaAcceptances).where(and(
      eq(ideaNdaAcceptances.ideaId, ideaId), eq(ideaNdaAcceptances.accountId, accountId),
      validInvitation ? eq(ideaNdaAcceptances.identityId, validInvitation.invitedIdentityId) : undefined,
    )).orderBy(desc(ideaNdaAcceptances.acceptedAt)).limit(1);
    const [creatorProfile] = await db.select({ displayName: identityProfiles.displayName }).from(identityProfiles)
      .where(and(eq(identityProfiles.identityId, idea.creatorIdentityId), isNull(identityProfiles.deletedAt))).limit(1);
    return {
      ideaId,
      ndaVersion: IDEA_NDA_VERSION,
      title: IDEA_NDA_TEMPLATE.title,
      summary: idea.summary,
      terms: IDEA_NDA_TEMPLATE.body,
      creatorDisplayIdentity: creatorProfile?.displayName ?? "创意发起人",
      canAccept: !owner && Boolean(validInvitation) && (!acceptance || Boolean(acceptance.revokedAt) || acceptance.ndaVersion !== IDEA_NDA_VERSION),
      accepted: Boolean(acceptance && !acceptance.revokedAt && acceptance.ndaVersion === IDEA_NDA_VERSION),
      acceptedAt: acceptance?.acceptedAt ?? null,
      revokedAt: acceptance?.revokedAt ?? null,
    };
  }

  async acceptNda(accountId: number, ideaId: number, identityId: number, requestId: string) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.ideaId, ideaId),
      eq(ideaCollaborationInvitations.invitedAccountId, accountId),
      eq(ideaCollaborationInvitations.invitedIdentityId, identityId),
      inArray(ideaCollaborationInvitations.status, ["pending", "accepted"]),
    )).orderBy(desc(ideaCollaborationInvitations.id)).limit(1);
    if (!snapshot || !invitationRelationshipActive(snapshot.status, snapshot.expiresAt, this.clock.now())) {
      throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    }
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: "idea.nda.accept",
      identityId,
      resourceType: "idea",
      resourceId: String(ideaId),
      purpose: "idea_nda_accept",
      requestId,
    });
    const outcome = await db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(eq(ideas.id, ideaId)).for("update").limit(1);
      const [invitation] = await tx.select().from(ideaCollaborationInvitations).where(eq(ideaCollaborationInvitations.id, snapshot.id)).for("update").limit(1);
      if (!idea || !invitation || invitation.invitedAccountId !== accountId || invitation.invitedIdentityId !== identityId ||
        !invitationRelationshipActive(invitation.status, invitation.expiresAt, this.clock.now())) {
        throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      }
      if (idea.visibility !== "nda" && !invitation.ndaRequired) throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const [identity] = await tx.select({ id: businessIdentities.id, accountId: businessIdentities.accountId, status: businessIdentities.status })
        .from(businessIdentities).where(and(eq(businessIdentities.id, identityId), eq(businessIdentities.accountId, accountId))).limit(1);
      if (!identity || identity.status !== "active") throw new IdeaServiceError("IDENTITY_INACTIVE");
      const [byRequest] = await tx.select().from(ideaNdaAcceptances).where(eq(ideaNdaAcceptances.requestId, requestId)).limit(1);
      if (byRequest) {
        if (byRequest.ideaId !== ideaId || byRequest.accountId !== accountId || byRequest.identityId !== identityId) throw new IdeaServiceError("IDEMPOTENCY_CONFLICT");
        return { acceptance: byRequest, idea, invitation, duplicate: true };
      }
      const [existing] = await tx.select().from(ideaNdaAcceptances).where(and(
        eq(ideaNdaAcceptances.ideaId, ideaId), eq(ideaNdaAcceptances.accountId, accountId), eq(ideaNdaAcceptances.identityId, identityId),
      )).for("update").limit(1);
      if (existing && !existing.revokedAt && existing.ndaVersion === IDEA_NDA_VERSION) {
        return { acceptance: existing, idea, invitation, duplicate: true };
      }
      const acceptedAt = this.clock.now();
      let acceptance: typeof ideaNdaAcceptances.$inferSelect;
      if (existing) {
        await tx.update(ideaNdaAcceptances).set({
          ndaVersion: IDEA_NDA_VERSION, acceptedAt, revokedAt: null, requestId,
        }).where(eq(ideaNdaAcceptances.id, existing.id));
        acceptance = { ...existing, ndaVersion: IDEA_NDA_VERSION, acceptedAt, revokedAt: null, requestId };
      } else {
        const result = await tx.insert(ideaNdaAcceptances).values({ ideaId, accountId, identityId, ndaVersion: IDEA_NDA_VERSION, acceptedAt, requestId });
        const [created] = await tx.select().from(ideaNdaAcceptances).where(eq(ideaNdaAcceptances.id, Number(result[0].insertId))).limit(1);
        if (!created) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
        acceptance = created;
      }
      await tx.update(ideas).set({ authorizationVersion: idea.authorizationVersion + 1 })
        .where(and(eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion)));
      return { acceptance, idea: { ...idea, authorizationVersion: idea.authorizationVersion + 1 }, invitation, duplicate: false };
    });
    if (!outcome.duplicate) await this.notifySafely({
      recipientAccountId: outcome.idea.creatorAccountId,
      event: "nda_accepted",
      ideaId,
      ideaTitle: outcome.idea.title,
      dedupeKey: `idea:${ideaId}:account:${accountId}:nda:${IDEA_NDA_VERSION}`,
    });
    return { ...outcome.acceptance, duplicate: outcome.duplicate, invitationStatus: outcome.invitation.status };
  }

  async getNdaStatus(accountId: number, ideaId: number, requestId?: string | null) {
    const db = await requireDb();
    const [idea] = await db.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).limit(1);
    if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    const owner = idea.creatorAccountId === accountId;
    const [invitation] = owner ? [] : await db.select().from(ideaCollaborationInvitations).where(and(
      eq(ideaCollaborationInvitations.ideaId, ideaId), eq(ideaCollaborationInvitations.invitedAccountId, accountId),
    )).orderBy(desc(ideaCollaborationInvitations.id)).limit(1);
    if (!owner && idea.visibility !== "public" && !invitation) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    await requireAllowed(this.authorization, accountId, {
      capabilityCode: idea.visibility === "public" && !invitation ? "idea.view_public" : "idea.nda.accept",
      identityId: invitation?.invitedIdentityId ?? (owner ? idea.creatorIdentityId : null),
      resourceType: "idea", resourceId: String(ideaId), purpose: "idea_nda_status", requestId,
    });
    const [acceptance] = !invitation ? [] : await db.select().from(ideaNdaAcceptances).where(and(
      eq(ideaNdaAcceptances.ideaId, ideaId), eq(ideaNdaAcceptances.accountId, accountId), eq(ideaNdaAcceptances.identityId, invitation.invitedIdentityId),
    )).orderBy(desc(ideaNdaAcceptances.acceptedAt)).limit(1);
    const required = idea.visibility === "nda" || Boolean(invitation?.ndaRequired);
    const activeInvitation = invitation ? invitationRelationshipActive(invitation.status, invitation.expiresAt, this.clock.now()) : false;
    const accepted = Boolean(required && activeInvitation && acceptance && !acceptance.revokedAt && acceptance.ndaVersion === IDEA_NDA_VERSION);
    let reasonCode = "NDA_NOT_REQUIRED";
    if (required && !invitation) reasonCode = "RESOURCE_RELATION_REQUIRED";
    else if (required && !activeInvitation) reasonCode = `INVITATION_${invitation?.status?.toUpperCase() ?? "INACTIVE"}`;
    else if (required && acceptance?.revokedAt) reasonCode = "NDA_REVOKED";
    else if (required && !accepted) reasonCode = "NDA_REQUIRED";
    else if (accepted) reasonCode = "ALLOWED";
    return {
      required,
      accepted,
      ndaVersion: IDEA_NDA_VERSION,
      acceptedAt: acceptance?.acceptedAt ?? null,
      invitationStatus: invitation?.status ?? null,
      canAccept: required && activeInvitation && !accepted,
      reasonCode,
    };
  }

  async convertToProject(accountId: number, ideaId: number, requestId: string) {
    const db = await requireDb();
    const [snapshot] = await db.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).limit(1);
    if (!snapshot) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
    const authorization = await this.authorization.authorize(accountId, {
      capabilityCode: "idea.convert_to_project",
      identityId: snapshot.creatorAccountId === accountId ? snapshot.creatorIdentityId : null,
      resourceType: "idea", resourceId: String(ideaId), purpose: "idea_convert_to_project", requestId,
      expectedResourceVersion: snapshot.authorizationVersion,
    });
    if (!authorization.allowed && !(snapshot.status === "converted" && snapshot.convertedProjectId && snapshot.creatorAccountId === accountId)) {
      throw new IdeaServiceError(authorization.reasonCode);
    }
    const outcome = await db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt))).for("update").limit(1);
      if (!idea) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");
      if (idea.status === "converted" && idea.convertedProjectId) {
        return { projectId: idea.convertedProjectId, duplicate: true, memberAccountIds: [] as number[], memberships: [] as { accountId: number; membershipId: number; roles: string[] }[] };
      }
      if (idea.status !== "published" && idea.status !== "collaborating") throw new IdeaServiceError("RESOURCE_STATE_FORBIDDEN");
      const owner = idea.creatorAccountId === accountId;
      const [authorizedLead] = owner ? [] : await tx.select({ id: ideaCollaborationInvitations.id }).from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId), eq(ideaCollaborationInvitations.invitedAccountId, accountId), eq(ideaCollaborationInvitations.status, "accepted"),
      )).limit(1);
      if (!owner && !authorizedLead) throw new IdeaServiceError("RESOURCE_RELATION_REQUIRED");

      const acceptedInvitations = await tx.select().from(ideaCollaborationInvitations).where(and(
        eq(ideaCollaborationInvitations.ideaId, ideaId), eq(ideaCollaborationInvitations.status, "accepted"),
      )).for("update");
      const engineerInvitation = acceptedInvitations.find((item) => item.requestedRole === "engineer" && item.invitedAccountId !== idea.creatorAccountId);
      if (!engineerInvitation) throw new IdeaServiceError("PROJECT_ENGINEER_REQUIRED");

      const memberPlans = new Map<number, { identityId: number; roles: Set<string>; clearance: "INTERNAL" | "NDA" }>();
      memberPlans.set(idea.creatorAccountId, { identityId: idea.creatorIdentityId, roles: new Set(["initiator"]), clearance: idea.visibility === "nda" ? "NDA" : "INTERNAL" });
      for (const invitation of acceptedInvitations) {
        if (invitation.invitedAccountId === idea.creatorAccountId) continue;
        const [identity] = await tx.select({ id: businessIdentities.id, accountId: businessIdentities.accountId, status: businessIdentities.status })
          .from(businessIdentities).where(and(eq(businessIdentities.id, invitation.invitedIdentityId), eq(businessIdentities.accountId, invitation.invitedAccountId))).limit(1);
        if (!identity || identity.status !== "active") throw new IdeaServiceError("IDENTITY_INACTIVE");
        const existing = memberPlans.get(invitation.invitedAccountId);
        const roleCode = projectRoleForIdeaRole(invitation.requestedRole);
        if (existing) {
          existing.roles.add(roleCode);
          if (invitation.requestedRole === "engineer") existing.identityId = invitation.invitedIdentityId;
          if (invitation.ndaRequired || idea.visibility === "nda") existing.clearance = "NDA";
        } else {
          memberPlans.set(invitation.invitedAccountId, {
            identityId: invitation.invitedIdentityId,
            roles: new Set([roleCode]),
            clearance: invitation.ndaRequired || idea.visibility === "nda" ? "NDA" : "INTERNAL",
          });
        }
      }
      const requiredRoles = [...new Set([...memberPlans.values()].flatMap((plan) => [...plan.roles]))];
      const roleRows = await tx.select({ code: projectRoles.code }).from(projectRoles).where(and(
        inArray(projectRoles.code, requiredRoles), eq(projectRoles.status, "active"), isNull(projectRoles.deletedAt),
      ));
      if (roleRows.length !== requiredRoles.length) throw new IdeaServiceError("PROJECT_ROLE_INACTIVE");

      const projectResult = await tx.insert(projects).values({
        needId: null,
        quoteId: null,
        ownerId: idea.creatorAccountId,
        engineerId: engineerInvitation.invitedAccountId,
        title: idea.title,
        totalAmount: 0,
        ownerConfirmedAt: this.clock.now(),
        engineerConfirmedAt: this.clock.now(),
        status: "in_progress",
        startedAt: this.clock.now(),
      });
      const projectId = Number(projectResult[0].insertId);
      if (!projectId) throw new IdeaServiceError("CONCURRENT_MODIFICATION");
      const memberships: { accountId: number; membershipId: number; roles: string[] }[] = [];
      for (const [memberAccountId, plan] of memberPlans) {
        const membershipResult = await tx.insert(projectMemberships).values({
          projectId,
          accountId: memberAccountId,
          businessIdentityId: plan.identityId,
          status: "active",
          confidentialityClearance: plan.clearance,
          lastRequestId: requestId,
        });
        const membershipId = Number(membershipResult[0].insertId);
        for (const roleCode of plan.roles) {
          await tx.insert(projectMembershipRoles).values({
            projectId,
            projectMembershipId: membershipId,
            roleCode,
            status: "active",
            assignedBy: accountId,
            lastRequestId: requestId,
          });
        }
        memberships.push({ accountId: memberAccountId, membershipId, roles: [...plan.roles] });
      }
      await tx.update(ideas).set({
        status: "converted", convertedProjectId: projectId, authorizationVersion: idea.authorizationVersion + 1,
      }).where(and(
        eq(ideas.id, idea.id), eq(ideas.authorizationVersion, idea.authorizationVersion), inArray(ideas.status, ["published", "collaborating"]),
      ));
      return {
        projectId,
        duplicate: false,
        memberAccountIds: [...memberPlans.keys()].filter((id) => id !== accountId),
        memberships,
      };
    });
    if (!outcome.duplicate) {
      await Promise.all(outcome.memberAccountIds.map((recipientAccountId) => this.notifySafely({
        recipientAccountId,
        event: "converted",
        ideaId,
        ideaTitle: snapshot.title,
        dedupeKey: `idea:${ideaId}:project:${outcome.projectId}:converted:${recipientAccountId}`,
      })));
    }
    return outcome;
  }
}

export const ideaService = new IdeaService();
