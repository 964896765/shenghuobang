import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  designVersionFiles,
  designVersions,
  fileAccessLogs,
  milestoneAcceptanceRounds,
  milestoneDeliverableSubmissionFiles,
  milestoneDeliverableSubmissions,
  milestoneRevisionRequests,
  milestones,
  projectFiles,
  projectIntentions,
  projectMembershipRoles,
  projectMemberships,
  projects,
  storedFiles,
  userProfiles,
  users,
} from "../../drizzle/schema";
import * as dbApi from "../db";
import { requireDb, createNotification } from "../db";
import { ENV } from "../_core/env";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "../storage/file-policy";
import { storagePut } from "../storage";
import { DevelopmentFileScanner } from "../storage/scanner";
import { validateProjectFileSize } from "../../shared/project-rules";

const projectFileScanner = new DevelopmentFileScanner();
const ACTIVE_PROJECT_STATUSES = new Set(["pending_confirmation", "pending_agreement", "pending_payment", "in_progress", "waiting_acceptance", "revision"]);
const MANAGER_ROLE_CODES = new Set(["initiator", "project_lead"]);
const DESIGN_EXECUTION_ROLE_CODES = new Set(["design_lead"]);
const ENGINEER_EXECUTION_ROLE_CODES = new Set(["engineer"]);
const HIGH_VALUE_INTENTION_TYPES = new Set(["trial", "purchase_interest", "collaboration_interest"]);
const PHONE_PATTERN = /(?:\+?\d[\d\s-]{6,}\d)/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DOCUMENT_PATTERN = /\b\d{15,18}[0-9Xx]\b/;

export class ProjectDesignPrototypeServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProjectDesignPrototypeServiceError";
  }
}

export interface DesignVersionDraftInput {
  projectId: number;
  title: string;
  summary: string;
  changeNotes?: string;
  requestId: string;
}

export interface DesignVersionDraftUpdate {
  designVersionId: number;
  title?: string;
  summary?: string;
  changeNotes?: string;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface DesignVersionUploadInput {
  designVersionId: number;
  fileName: string;
  mimeType?: string;
  base64Data: string;
  fileRole: "source" | "preview" | "reference" | "specification" | "other";
  sortOrder?: number;
  description?: string;
  confidentialityLevel?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "NDA" | "RESTRICTED";
  ndaRequired?: boolean;
  requestId: string;
}

export interface PrototypeMilestoneCreateInput {
  projectId: number;
  title: string;
  description?: string;
  sortOrder?: number;
  prototypeTaskType: "designer" | "engineer";
  assigneeProjectMembershipId?: number;
  requestId: string;
}

export interface PrototypeMilestoneUpdateInput {
  milestoneId: number;
  title?: string;
  description?: string;
  sortOrder?: number;
  prototypeTaskType?: "designer" | "engineer";
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface PrototypeMilestoneAssignInput {
  milestoneId: number;
  assigneeProjectMembershipId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface PrototypeMilestoneStartInput {
  milestoneId: number;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface PrototypeDeliverableInput {
  milestoneId: number;
  note: string;
  fileIds?: number[];
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface PrototypeAcceptanceDecisionInput {
  milestoneId: number;
  submissionId: number;
  decisionNote?: string;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface PrototypeRevisionRequestInput {
  milestoneId: number;
  submissionId: number;
  reason: string;
  requirements?: string[];
  assigneeProjectMembershipId?: number;
  dueAt?: Date;
  expectedAuthorizationVersion?: number;
  requestId: string;
}

export interface ProjectIntentionRegisterInput {
  projectId: number;
  intentionType: "follow" | "trial" | "purchase_interest" | "collaboration_interest";
  note?: string;
  requestId: string;
}

export interface ProjectIntentionWithdrawInput {
  intentionId: number;
  requestId: string;
}

function cleanText(value: string, code: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new ProjectDesignPrototypeServiceError(code);
  return result;
}

function ensureRequestId(value: string): string {
  const result = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(result)) throw new ProjectDesignPrototypeServiceError("REQUEST_ID_INVALID");
  return result;
}

function serializeDesignVersionStatus(status: string): "draft" | "submitted" | "superseded" | "withdrawn" {
  if (status === "draft" || status === "submitted" || status === "superseded" || status === "withdrawn") return status;
  throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
}

function serializePrototypeMilestoneStatus(status: string): "planned" | "in_progress" | "submitted" {
  if (status === "pending") return "planned";
  if (status === "in_progress") return "in_progress";
  if (status === "submitted") return "submitted";
  throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
}

function serializeAcceptanceRoundStatus(status: string): "pending_review" | "accepted" | "revision_requested" | "superseded" {
  if (status === "pending_review" || status === "accepted" || status === "revision_requested" || status === "superseded") return status;
  throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
}

function serializeRevisionRequestStatus(status: string): "open" | "resubmitted" | "closed" {
  if (status === "open" || status === "resubmitted" || status === "closed") return status;
  throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
}

function sanitizeRequirements(values?: string[]) {
  const unique = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (unique.some((value) => value.length > 500) || unique.length > 20) {
    throw new ProjectDesignPrototypeServiceError("REVISION_REQUIREMENTS_INVALID");
  }
  return unique;
}

function cleanOptionalText(value: string | undefined, max: number) {
  const result = value?.trim();
  if (!result) return null;
  if (result.length > max) throw new ProjectDesignPrototypeServiceError("TEXT_INVALID");
  return result;
}

function textLooksSensitive(value: string) {
  return PHONE_PATTERN.test(value) || EMAIL_PATTERN.test(value) || DOCUMENT_PATTERN.test(value);
}

function validateIntentionNote(value?: string) {
  const note = value?.trim();
  if (!note) return null;
  if (note.length > 500) throw new ProjectDesignPrototypeServiceError("INTENTION_NOTE_INVALID");
  if (textLooksSensitive(note)) throw new ProjectDesignPrototypeServiceError("INTENTION_NOTE_INVALID");
  return note;
}

function activeIntentionKey(projectId: number, accountId: number, intentionType: string) {
  return `${projectId}:${accountId}:${intentionType}`;
}

function assertProjectActive(status: string) {
  if (!ACTIVE_PROJECT_STATUSES.has(status)) throw new ProjectDesignPrototypeServiceError("PROJECT_INACTIVE");
}

function executionRoleSet(taskType: "designer" | "engineer") {
  return taskType === "designer" ? DESIGN_EXECUTION_ROLE_CODES : ENGINEER_EXECUTION_ROLE_CODES;
}

async function activeProjectRoleCodes(tx: any, projectMembershipId: number) {
  const rows: Array<{ roleCode: string }> = await tx.select({
    roleCode: projectMembershipRoles.roleCode,
  }).from(projectMembershipRoles).where(and(
    eq(projectMembershipRoles.projectMembershipId, projectMembershipId),
    eq(projectMembershipRoles.status, "active"),
  ));
  return new Set(rows.map((row: { roleCode: string }) => row.roleCode));
}

function canManagePrototypeMilestone(roleCodes: Set<string>) {
  return [...roleCodes].some((code) => MANAGER_ROLE_CODES.has(code));
}

function compatibleAssignee(roleCodes: Set<string>, taskType: "designer" | "engineer") {
  const allowed = executionRoleSet(taskType);
  return [...roleCodes].some((code) => allowed.has(code));
}

async function ensureLegacyProjectMembership(tx: any, project: typeof projects.$inferSelect, accountId: number, requestId: string) {
  const [existing] = await tx.select().from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, project.id), eq(projectMemberships.accountId, accountId)))
    .for("update")
    .limit(1);
  if (existing) return existing;
  if (accountId !== project.ownerId && accountId !== project.engineerId) return null;
  const result = await tx.insert(projectMemberships).values({
    projectId: project.id,
    accountId,
    businessIdentityId: null,
    sourceOrganizationId: null,
    status: "active",
    confidentialityClearance: "INTERNAL",
    lastRequestId: requestId,
  });
  const membershipId = Number(result[0].insertId);
  await tx.insert(projectMembershipRoles).values({
    projectId: project.id,
    projectMembershipId: membershipId,
    roleCode: accountId === project.ownerId ? "project_lead" : "engineer",
    status: "active",
    assignedBy: accountId,
    lastRequestId: requestId,
  });
  const [created] = await tx.select().from(projectMemberships).where(eq(projectMemberships.id, membershipId)).limit(1);
  return created;
}

async function requireProjectActor(tx: any, projectId: number, accountId: number, requestId: string, lock = false) {
  const projectQuery = tx.select().from(projects).where(eq(projects.id, projectId));
  const projectRows = await (lock ? projectQuery.for("update") : projectQuery).limit(1);
  const project = projectRows[0];
  if (!project) throw new ProjectDesignPrototypeServiceError("PROJECT_NOT_FOUND");
  const membership = await ensureLegacyProjectMembership(tx, project, accountId, requestId);
  if (!membership || membership.status !== "active") throw new ProjectDesignPrototypeServiceError("PROJECT_MEMBERSHIP_INACTIVE");
  const roleCodes = await activeProjectRoleCodes(tx, membership.id);
  return { project, membership, roleCodes };
}

async function requireTargetMembership(tx: any, projectId: number, membershipId: number) {
  const [membership] = await tx.select().from(projectMemberships)
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.id, membershipId)))
    .for("update")
    .limit(1);
  if (!membership || membership.status !== "active") throw new ProjectDesignPrototypeServiceError("PROJECT_MEMBERSHIP_INACTIVE");
  return { membership, roleCodes: await activeProjectRoleCodes(tx, membership.id) };
}

async function loadDesignVersionForUpdate(tx: any, designVersionId: number) {
  const [row] = await tx.select().from(designVersions).where(eq(designVersions.id, designVersionId)).for("update").limit(1);
  if (!row) throw new ProjectDesignPrototypeServiceError("DESIGN_VERSION_NOT_FOUND");
  return row;
}

async function loadPrototypeMilestoneForUpdate(tx: any, milestoneId: number) {
  const [row] = await tx.select().from(milestones).where(eq(milestones.id, milestoneId)).for("update").limit(1);
  if (!row) throw new ProjectDesignPrototypeServiceError("MILESTONE_NOT_FOUND");
  if (row.milestoneType !== "prototype") throw new ProjectDesignPrototypeServiceError("PROTOTYPE_MILESTONE_REQUIRED");
  return row;
}

function assertExpectedVersion(actual: number, expected?: number) {
  if (expected != null && expected !== actual) throw new ProjectDesignPrototypeServiceError("CONCURRENT_MODIFICATION");
}

function designVersionSummary(row: typeof designVersions.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    versionNo: row.versionNo,
    title: row.title,
    summary: row.summary,
    changeNotes: row.changeNotes,
    status: serializeDesignVersionStatus(row.status),
    createdByProjectMembershipId: row.createdByProjectMembershipId,
    submittedByProjectMembershipId: row.submittedByProjectMembershipId,
    submittedAt: row.submittedAt,
    authorizationVersion: row.authorizationVersion,
    requestId: row.requestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function prototypeMilestoneSummary(row: typeof milestones.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    status: serializePrototypeMilestoneStatus(row.status),
    milestoneType: row.milestoneType,
    prototypeTaskType: row.prototypeTaskType,
    assigneeProjectMembershipId: row.assigneeProjectMembershipId,
    startedAt: row.startedAt,
    startedByProjectMembershipId: row.startedByProjectMembershipId,
    submittedAt: row.submittedAt,
    lastSubmittedByProjectMembershipId: row.lastSubmittedByProjectMembershipId,
    authorizationVersion: row.authorizationVersion,
    createdAt: row.createdAt,
  };
}

function acceptanceRoundSummary(row: typeof milestoneAcceptanceRounds.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    submissionId: row.submissionId,
    roundNo: row.roundNo,
    status: serializeAcceptanceRoundStatus(row.status),
    reviewerProjectMembershipId: row.reviewerProjectMembershipId,
    decisionNote: row.decisionNote,
    requestId: row.requestId,
    decidedAt: row.decidedAt,
    authorizationVersion: row.authorizationVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function revisionRequestSummary(row: typeof milestoneRevisionRequests.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    acceptanceRoundId: row.acceptanceRoundId,
    reason: row.reason,
    requirements: Array.isArray(row.requirementsJson) ? row.requirementsJson.map(String) : [],
    assignedProjectMembershipId: row.assignedProjectMembershipId,
    dueAt: row.dueAt,
    status: serializeRevisionRequestStatus(row.status),
    createdByProjectMembershipId: row.createdByProjectMembershipId,
    resolvedBySubmissionId: row.resolvedBySubmissionId,
    requestId: row.requestId,
    authorizationVersion: row.authorizationVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function createPendingAcceptanceRound(tx: any, milestone: typeof milestones.$inferSelect, submission: typeof milestoneDeliverableSubmissions.$inferSelect) {
  const existing = await tx.select().from(milestoneAcceptanceRounds)
    .where(eq(milestoneAcceptanceRounds.submissionId, submission.id))
    .limit(1);
  if (existing[0]) return existing[0];
  const roundRows = await tx.select({ roundNo: milestoneAcceptanceRounds.roundNo })
    .from(milestoneAcceptanceRounds)
    .where(eq(milestoneAcceptanceRounds.milestoneId, milestone.id))
    .for("update");
  const nextRoundNo = Math.max(0, ...roundRows.map((row: { roundNo: number }) => row.roundNo)) + 1;
  await tx.insert(milestoneAcceptanceRounds).values({
    projectId: milestone.projectId,
    milestoneId: milestone.id,
    submissionId: submission.id,
    roundNo: nextRoundNo,
    status: "pending_review",
    requestId: `system:acceptance-round:${submission.id}`,
    authorizationVersion: 1,
  });
  const [created] = await tx.select().from(milestoneAcceptanceRounds)
    .where(eq(milestoneAcceptanceRounds.submissionId, submission.id))
    .limit(1);
  return created;
}

async function latestSubmissionForMilestone(tx: any, milestoneId: number) {
  const [row] = await tx.select().from(milestoneDeliverableSubmissions)
    .where(eq(milestoneDeliverableSubmissions.milestoneId, milestoneId))
    .orderBy(desc(milestoneDeliverableSubmissions.submissionVersion), desc(milestoneDeliverableSubmissions.id))
    .for("update")
    .limit(1);
  return row ?? null;
}

async function latestAcceptanceRoundForMilestone(tx: any, milestoneId: number) {
  const [row] = await tx.select().from(milestoneAcceptanceRounds)
    .where(eq(milestoneAcceptanceRounds.milestoneId, milestoneId))
    .orderBy(desc(milestoneAcceptanceRounds.roundNo), desc(milestoneAcceptanceRounds.id))
    .for("update")
    .limit(1);
  return row ?? null;
}

async function openRevisionRequestForMilestone(tx: any, milestoneId: number) {
  const [row] = await tx.select().from(milestoneRevisionRequests)
    .where(and(eq(milestoneRevisionRequests.milestoneId, milestoneId), eq(milestoneRevisionRequests.status, "open")))
    .orderBy(desc(milestoneRevisionRequests.id))
    .for("update")
    .limit(1);
  return row ?? null;
}

async function projectManagerAccountIds(projectId: number) {
  const database = await requireDb();
  const rows = await database.select({
    accountId: projectMemberships.accountId,
    roleCode: projectMembershipRoles.roleCode,
  }).from(projectMemberships)
    .leftJoin(
      projectMembershipRoles,
      and(
        eq(projectMembershipRoles.projectMembershipId, projectMemberships.id),
        eq(projectMembershipRoles.projectId, projectMemberships.projectId),
        eq(projectMembershipRoles.status, "active"),
      ),
    )
    .where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.status, "active")));
  return [...new Set(rows
    .filter((row) => row.roleCode != null && MANAGER_ROLE_CODES.has(row.roleCode))
    .map((row) => row.accountId))];
}

async function notifyRecipients(projectId: number, actorAccountId: number, title: string, content: string, dedupeSuffix: string) {
  try {
    const database = await requireDb();
    const rows = await database.select({
      accountId: projectMemberships.accountId,
    }).from(projectMemberships).where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.status, "active")));
    const recipients = [...new Set(rows.map((row) => row.accountId))].filter((id) => id !== actorAccountId);
    await Promise.all(recipients.map((userId) => createNotification({
      userId,
      category: "project",
      title,
      content,
      refType: "project",
      refId: projectId,
      dedupeKey: `project:${projectId}:${dedupeSuffix}:${userId}`,
    }).catch(() => undefined)));
  } catch {
    // Notification failure must not roll back the business transaction.
  }
}

async function loadStoredFileByProjectFile(tx: any, projectFileId: number) {
  const [projectFile] = await tx.select().from(projectFiles).where(eq(projectFiles.id, projectFileId)).limit(1);
  if (!projectFile) throw new ProjectDesignPrototypeServiceError("PROJECT_FILE_NOT_FOUND");
  const [storedFile] = await tx.select().from(storedFiles).where(eq(storedFiles.storageKey, projectFile.storageKey)).limit(1);
  if (!storedFile) throw new ProjectDesignPrototypeServiceError("FILE_NOT_FOUND");
  return { projectFile, storedFile };
}

export class ProjectDesignPrototypeService {
  async createDesignVersionDraft(accountId: number, input: DesignVersionDraftInput) {
    const requestId = ensureRequestId(input.requestId);
    const title = cleanText(input.title, "TITLE_INVALID", 255);
    const summary = cleanText(input.summary, "SUMMARY_INVALID", 500);
    const changeNotes = input.changeNotes?.trim().slice(0, 5000) || null;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const actor = await requireProjectActor(tx, input.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      const [existing] = await tx.select().from(designVersions).where(eq(designVersions.requestId, requestId)).limit(1);
      if (existing) {
        if (existing.projectId !== input.projectId) throw new ProjectDesignPrototypeServiceError("IDEMPOTENCY_CONFLICT");
        return { ...designVersionSummary(existing), duplicate: true };
      }
      const rows = await tx.select({ versionNo: designVersions.versionNo }).from(designVersions)
        .where(eq(designVersions.projectId, input.projectId))
        .for("update");
      const versionNo = Math.max(0, ...rows.map((row: { versionNo: number }) => row.versionNo)) + 1;
      const result = await tx.insert(designVersions).values({
        projectId: input.projectId,
        versionNo,
        title,
        summary,
        changeNotes,
        status: "draft",
        createdByProjectMembershipId: actor.membership.id,
        submittedByProjectMembershipId: null,
        submittedAt: null,
        authorizationVersion: 1,
        requestId,
      });
      const [created] = await tx.select().from(designVersions).where(eq(designVersions.id, Number(result[0].insertId))).limit(1);
      return { ...designVersionSummary(created), duplicate: false };
    });
  }

  async updateDesignVersionDraft(accountId: number, input: DesignVersionDraftUpdate) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const version = await loadDesignVersionForUpdate(tx, input.designVersionId);
      const actor = await requireProjectActor(tx, version.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(version.authorizationVersion, input.expectedAuthorizationVersion);
      if (version.status !== "draft") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      if (version.requestId === requestId) return { ...designVersionSummary(version), duplicate: true };
      await tx.update(designVersions).set({
        title: input.title != null ? cleanText(input.title, "TITLE_INVALID", 255) : version.title,
        summary: input.summary != null ? cleanText(input.summary, "SUMMARY_INVALID", 500) : version.summary,
        changeNotes: input.changeNotes != null ? (input.changeNotes.trim().slice(0, 5000) || null) : version.changeNotes,
        authorizationVersion: version.authorizationVersion + 1,
        requestId,
      }).where(eq(designVersions.id, version.id));
      const [updated] = await tx.select().from(designVersions).where(eq(designVersions.id, version.id)).limit(1);
      return { ...designVersionSummary(updated), duplicate: false };
    });
  }

  async listDesignVersions(accountId: number, projectId: number, limit = 20, cursor?: number) {
    const requestId = `design-version-list:${projectId}:${accountId}`;
    const db = await requireDb();
    await db.transaction(async (tx) => {
      await requireProjectActor(tx, projectId, accountId, requestId, false);
    });
    const rows = await db.select().from(designVersions)
      .where(and(eq(designVersions.projectId, projectId), cursor ? lt(designVersions.id, cursor) : undefined))
      .orderBy(desc(designVersions.versionNo), desc(designVersions.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(designVersionSummary),
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }

  async designVersionDetail(accountId: number, designVersionId: number) {
    const requestId = `design-version-detail:${designVersionId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const version = await loadDesignVersionForUpdate(tx, designVersionId);
      await requireProjectActor(tx, version.projectId, accountId, requestId, false);
      const files = await tx.select({
        id: designVersionFiles.id,
        designVersionId: designVersionFiles.designVersionId,
        projectFileId: designVersionFiles.projectFileId,
        fileRole: designVersionFiles.fileRole,
        sortOrder: designVersionFiles.sortOrder,
        uploadedByProjectMembershipId: designVersionFiles.uploadedByProjectMembershipId,
        disabledAt: designVersionFiles.disabledAt,
        accessPolicyVersion: designVersionFiles.accessPolicyVersion,
        createdAt: designVersionFiles.createdAt,
        fileName: projectFiles.fileName,
        mimeType: projectFiles.mimeType,
        sizeBytes: projectFiles.sizeBytes,
        status: projectFiles.status,
        confidentialityLevel: projectFiles.confidentialityLevel,
        ndaRequired: projectFiles.ndaRequired,
        projectFileAccessPolicyVersion: projectFiles.accessPolicyVersion,
      }).from(designVersionFiles)
        .innerJoin(projectFiles, eq(projectFiles.id, designVersionFiles.projectFileId))
        .where(eq(designVersionFiles.designVersionId, designVersionId))
        .orderBy(asc(designVersionFiles.sortOrder), asc(designVersionFiles.id));
      return {
        version: designVersionSummary(version),
        files: files.map((file) => ({
          id: file.id,
          designVersionId: file.designVersionId,
          projectFileId: file.projectFileId,
          fileRole: file.fileRole,
          sortOrder: file.sortOrder,
          uploadedByProjectMembershipId: file.uploadedByProjectMembershipId,
          disabledAt: file.disabledAt,
          accessPolicyVersion: file.accessPolicyVersion,
          createdAt: file.createdAt,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          status: file.status,
          confidentialityLevel: file.confidentialityLevel,
          ndaRequired: file.ndaRequired,
        })),
      };
    });
  }

  async uploadDesignVersionFile(accountId: number, input: DesignVersionUploadInput) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    const version = await db.transaction(async (tx) => {
      const row = await loadDesignVersionForUpdate(tx, input.designVersionId);
      const actor = await requireProjectActor(tx, row.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      if (row.status !== "draft") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      return { row, actor };
    });

    const payload = input.base64Data.includes(",") ? input.base64Data.split(",").pop() ?? "" : input.base64Data;
    const buffer = Buffer.from(payload, "base64");
    validateProjectFileSize(buffer.byteLength);
    if (await dbApi.countStoredFiles(accountId, "project", version.row.projectId) >= ENV.maxFilesPerEntity) {
      throw new ProjectDesignPrototypeServiceError("FILE_LIMIT_REACHED");
    }
    const safeName = sanitizeFileName(input.fileName);
    const detected = detectFile(buffer);
    const mimeType = input.mimeType ?? detected.mimeType;
    validateMimeAndExtension(safeName, mimeType, detected);
    const scan = await projectFileScanner.scan(buffer, safeName, detected.mimeType);
    if (scan.status === "rejected") throw new ProjectDesignPrototypeServiceError("FILE_SCAN_REJECTED");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    if (await dbApi.findStoredFileByOwnerAndHash(accountId, sha256)) throw new ProjectDesignPrototypeServiceError("FILE_DUPLICATE");
    const stored = await storagePut(`projects/${version.row.projectId}/design/${crypto.randomUUID()}-${safeName}`, buffer, mimeType);
    const storedFileId = await dbApi.createStoredFile({
      ownerId: accountId,
      provider: stored.provider,
      storageKey: stored.key,
      originalName: safeName,
      mimeType,
      sizeBytes: buffer.byteLength,
      sha256,
      privacyLevel: "high_sensitive",
      virusScanStatus: scan.status,
      status: "available",
      relatedEntityType: "project",
      relatedEntityId: version.row.projectId,
    });
    await dbApi.addFileAccessLog({ fileId: storedFileId, userId: accountId, action: "upload", relatedEntityType: "project", relatedEntityId: version.row.projectId });
    const projectFile = await dbApi.createProjectFile({
      projectId: version.row.projectId,
      milestoneId: undefined,
      fileGroupId: crypto.randomUUID(),
      fileName: safeName,
      storageKey: stored.key,
      publicUrl: undefined,
      mimeType,
      sizeBytes: buffer.byteLength,
      category: "design",
      description: input.description?.trim().slice(0, 1000),
      formalSubmission: false,
      confidentialityLevel: input.confidentialityLevel ?? "INTERNAL",
      ndaRequired: input.ndaRequired ?? false,
      uploadedBy: accountId,
    });
    return db.transaction(async (tx) => {
      const lockedVersion = await loadDesignVersionForUpdate(tx, input.designVersionId);
      if (lockedVersion.status !== "draft") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      await tx.insert(designVersionFiles).values({
        designVersionId: lockedVersion.id,
        projectFileId: projectFile.id,
        fileRole: input.fileRole,
        sortOrder: input.sortOrder ?? 0,
        uploadedByProjectMembershipId: version.actor.membership.id,
      });
      await tx.update(designVersions).set({
        authorizationVersion: lockedVersion.authorizationVersion + 1,
        requestId,
      }).where(eq(designVersions.id, lockedVersion.id));
      const [attached] = await tx.select({
        id: designVersionFiles.id,
        designVersionId: designVersionFiles.designVersionId,
        projectFileId: designVersionFiles.projectFileId,
        fileRole: designVersionFiles.fileRole,
        sortOrder: designVersionFiles.sortOrder,
        uploadedByProjectMembershipId: designVersionFiles.uploadedByProjectMembershipId,
        disabledAt: designVersionFiles.disabledAt,
        accessPolicyVersion: designVersionFiles.accessPolicyVersion,
        createdAt: designVersionFiles.createdAt,
      }).from(designVersionFiles)
        .where(and(eq(designVersionFiles.designVersionId, lockedVersion.id), eq(designVersionFiles.projectFileId, projectFile.id)))
        .limit(1);
      return attached;
    });
  }

  async disableDesignVersionFile(accountId: number, designVersionFileId: number, requestId: string) {
    const normalizedRequestId = ensureRequestId(requestId);
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [file] = await tx.select({
        id: designVersionFiles.id,
        designVersionId: designVersionFiles.designVersionId,
        projectFileId: designVersionFiles.projectFileId,
        disabledAt: designVersionFiles.disabledAt,
        accessPolicyVersion: designVersionFiles.accessPolicyVersion,
      }).from(designVersionFiles).where(eq(designVersionFiles.id, designVersionFileId)).for("update").limit(1);
      if (!file) throw new ProjectDesignPrototypeServiceError("DESIGN_VERSION_FILE_NOT_FOUND");
      const version = await loadDesignVersionForUpdate(tx, file.designVersionId);
      const actor = await requireProjectActor(tx, version.projectId, accountId, normalizedRequestId, true);
      assertProjectActive(actor.project.status);
      if (file.disabledAt) return { success: true, duplicate: true };
      const now = new Date();
      await tx.update(designVersionFiles).set({
        disabledAt: now,
        accessPolicyVersion: file.accessPolicyVersion + 1,
      }).where(eq(designVersionFiles.id, file.id));
      await tx.update(designVersions).set({
        authorizationVersion: version.authorizationVersion + 1,
        requestId: normalizedRequestId,
      }).where(eq(designVersions.id, version.id));
      const { projectFile, storedFile } = await loadStoredFileByProjectFile(tx, file.projectFileId);
      await tx.update(projectFiles).set({
        status: "disabled",
        disabledAt: now,
        disabledBy: accountId,
        accessPolicyVersion: projectFile.accessPolicyVersion + 1,
      }).where(eq(projectFiles.id, file.projectFileId));
      await tx.update(storedFiles).set({
        status: "disabled",
        accessPolicyVersion: storedFile.accessPolicyVersion + 1,
      }).where(eq(storedFiles.id, storedFile.id));
      await tx.insert(fileAccessLogs).values({
        fileId: storedFile.id,
        userId: accountId,
        action: "disable",
        relatedEntityType: "project",
        relatedEntityId: version.projectId,
        result: "success",
        reason: "design_version_file_disabled",
      });
      return { success: true, duplicate: false };
    });
  }

  async submitDesignVersion(accountId: number, designVersionId: number, expectedAuthorizationVersion: number | undefined, requestId: string) {
    const normalizedRequestId = ensureRequestId(requestId);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const version = await loadDesignVersionForUpdate(tx, designVersionId);
      const actor = await requireProjectActor(tx, version.projectId, accountId, normalizedRequestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(version.authorizationVersion, expectedAuthorizationVersion);
      if (version.status === "withdrawn") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      if (version.status === "submitted" && version.requestId === normalizedRequestId) return { version, project: actor.project, duplicate: true, supersededCount: 0 };
      if (version.status !== "draft") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      const activeFiles = await tx.select({ id: designVersionFiles.id }).from(designVersionFiles)
        .where(and(eq(designVersionFiles.designVersionId, designVersionId), isNull(designVersionFiles.disabledAt))).limit(1);
      if (activeFiles.length === 0) throw new ProjectDesignPrototypeServiceError("DESIGN_VERSION_FILES_REQUIRED");
      const previousSubmitted = await tx.select({ id: designVersions.id }).from(designVersions)
        .where(and(eq(designVersions.projectId, version.projectId), eq(designVersions.status, "submitted"), lt(designVersions.id, Number.MAX_SAFE_INTEGER)))
        .for("update");
      if (previousSubmitted.length > 0) {
        await tx.update(designVersions).set({
          status: "superseded",
        }).where(inArray(designVersions.id, previousSubmitted.map((row: { id: number }) => row.id)));
      }
      const submittedAt = new Date();
      await tx.update(designVersions).set({
        status: "submitted",
        submittedAt,
        submittedByProjectMembershipId: actor.membership.id,
        authorizationVersion: version.authorizationVersion + 1,
        requestId: normalizedRequestId,
      }).where(eq(designVersions.id, version.id));
      const [submitted] = await tx.select().from(designVersions).where(eq(designVersions.id, version.id)).limit(1);
      return { version: submitted, project: actor.project, duplicate: false, supersededCount: previousSubmitted.length };
    });
    if (!outcome.duplicate) {
      await notifyRecipients(
        outcome.project.id,
        accountId,
        outcome.supersededCount > 0 ? "新设计版本已提交并替代旧版本" : "设计版本已提交",
        `项目「${outcome.project.title}」的设计版本 V${outcome.version.versionNo} 已提交。`,
        outcome.supersededCount > 0 ? `design-version-superseded:${outcome.version.id}` : `design-version-submitted:${outcome.version.id}`,
      );
    }
    return { ...designVersionSummary(outcome.version), duplicate: outcome.duplicate, supersededCount: outcome.supersededCount };
  }

  async withdrawDesignVersion(accountId: number, designVersionId: number, expectedAuthorizationVersion: number | undefined, requestId: string) {
    const normalizedRequestId = ensureRequestId(requestId);
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const version = await loadDesignVersionForUpdate(tx, designVersionId);
      const actor = await requireProjectActor(tx, version.projectId, accountId, normalizedRequestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(version.authorizationVersion, expectedAuthorizationVersion);
      if (version.status === "withdrawn" && version.requestId === normalizedRequestId) return { ...designVersionSummary(version), duplicate: true };
      if (!["draft", "submitted"].includes(version.status)) throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      await tx.update(designVersions).set({
        status: "withdrawn",
        authorizationVersion: version.authorizationVersion + 1,
        requestId: normalizedRequestId,
      }).where(eq(designVersions.id, version.id));
      const [updated] = await tx.select().from(designVersions).where(eq(designVersions.id, version.id)).limit(1);
      return { ...designVersionSummary(updated), duplicate: false };
    });
  }

  async createPrototypeMilestone(accountId: number, input: PrototypeMilestoneCreateInput) {
    const requestId = ensureRequestId(input.requestId);
    const title = cleanText(input.title, "TITLE_INVALID", 255);
    const description = input.description?.trim().slice(0, 5000) || null;
    const db = await requireDb();
    const created = await db.transaction(async (tx) => {
      const actor = await requireProjectActor(tx, input.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      let assigneeId = input.assigneeProjectMembershipId ?? null;
      if (assigneeId != null) {
        const target = await requireTargetMembership(tx, input.projectId, assigneeId);
        if (!compatibleAssignee(target.roleCodes, input.prototypeTaskType)) throw new ProjectDesignPrototypeServiceError("MILESTONE_ASSIGNEE_INVALID");
      }
      const result = await tx.insert(milestones).values({
        projectId: input.projectId,
        title,
        description,
        amount: 0,
        sortOrder: input.sortOrder ?? 0,
        milestoneType: "prototype",
        prototypeTaskType: input.prototypeTaskType,
        status: "pending",
        assigneeProjectMembershipId: assigneeId,
        authorizationVersion: 1,
      });
      const [row] = await tx.select().from(milestones).where(eq(milestones.id, Number(result[0].insertId))).limit(1);
      return { row, project: actor.project, assigneeId };
    });
    await notifyRecipients(
      created.project.id,
      accountId,
      "原型里程碑已创建",
      `项目「${created.project.title}」新增原型里程碑「${created.row.title}」。`,
      `prototype-milestone-created:${created.row.id}`,
    );
    return prototypeMilestoneSummary(created.row);
  }

  async updatePrototypeMilestone(accountId: number, input: PrototypeMilestoneUpdateInput) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      if (milestone.status !== "pending") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      const nextTaskType = input.prototypeTaskType ?? (milestone.prototypeTaskType as "designer" | "engineer");
      if (!nextTaskType) throw new ProjectDesignPrototypeServiceError("MILESTONE_TASK_TYPE_INVALID");
      if (milestone.assigneeProjectMembershipId != null) {
        const target = await requireTargetMembership(tx, milestone.projectId, milestone.assigneeProjectMembershipId);
        if (!compatibleAssignee(target.roleCodes, nextTaskType)) throw new ProjectDesignPrototypeServiceError("MILESTONE_ASSIGNEE_INVALID");
      }
      await tx.update(milestones).set({
        title: input.title != null ? cleanText(input.title, "TITLE_INVALID", 255) : milestone.title,
        description: input.description != null ? (input.description.trim().slice(0, 5000) || null) : milestone.description,
        sortOrder: input.sortOrder ?? milestone.sortOrder,
        prototypeTaskType: nextTaskType,
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [updated] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id)).limit(1);
      return prototypeMilestoneSummary(updated);
    });
  }

  async assignPrototypeMilestone(accountId: number, input: PrototypeMilestoneAssignInput) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      if (milestone.status !== "pending") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      const taskType = milestone.prototypeTaskType as "designer" | "engineer" | null;
      if (!taskType) throw new ProjectDesignPrototypeServiceError("MILESTONE_TASK_TYPE_INVALID");
      const target = await requireTargetMembership(tx, milestone.projectId, input.assigneeProjectMembershipId);
      if (!compatibleAssignee(target.roleCodes, taskType)) throw new ProjectDesignPrototypeServiceError("MILESTONE_ASSIGNEE_INVALID");
      await tx.update(milestones).set({
        assigneeProjectMembershipId: input.assigneeProjectMembershipId,
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [updated] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id)).limit(1);
      return { milestone: updated, project: actor.project, assigneeAccountId: target.membership.accountId };
    });
    await notifyRecipients(
      outcome.project.id,
      accountId,
      "原型里程碑已指派",
      `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已完成指派。`,
      `prototype-milestone-assigned:${outcome.milestone.id}`,
    );
    return prototypeMilestoneSummary(outcome.milestone);
  }

  async startPrototypeMilestone(accountId: number, input: PrototypeMilestoneStartInput) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      if (milestone.status !== "pending") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      const actorCanStart = milestone.assigneeProjectMembershipId === actor.membership.id || canManagePrototypeMilestone(actor.roleCodes);
      if (!actorCanStart) throw new ProjectDesignPrototypeServiceError("RESOURCE_RELATION_REQUIRED");
      await tx.update(milestones).set({
        status: "in_progress",
        startedAt: new Date(),
        startedByProjectMembershipId: actor.membership.id,
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [updated] = await tx.select().from(milestones).where(eq(milestones.id, milestone.id)).limit(1);
      await tx.update(projects).set({ status: "in_progress" }).where(eq(projects.id, actor.project.id));
      return { milestone: updated, project: actor.project };
    });
    await notifyRecipients(
      outcome.project.id,
      accountId,
      "原型里程碑已启动",
      `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已启动。`,
      `prototype-milestone-started:${outcome.milestone.id}`,
    );
    return prototypeMilestoneSummary(outcome.milestone);
  }

  async listPrototypeMilestones(accountId: number, projectId: number, limit = 20, cursor?: number) {
    const requestId = `prototype-milestone-list:${projectId}:${accountId}`;
    const db = await requireDb();
    await db.transaction(async (tx) => {
      await requireProjectActor(tx, projectId, accountId, requestId, false);
    });
    const rows = await db.select().from(milestones)
      .where(and(eq(milestones.projectId, projectId), eq(milestones.milestoneType, "prototype"), cursor ? lt(milestones.id, cursor) : undefined))
      .orderBy(asc(milestones.sortOrder), desc(milestones.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(prototypeMilestoneSummary),
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }

  async prototypeMilestoneDetail(accountId: number, milestoneId: number) {
    const requestId = `prototype-milestone-detail:${milestoneId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, milestoneId);
      await requireProjectActor(tx, milestone.projectId, accountId, requestId, false);
      const submissions = await tx.select().from(milestoneDeliverableSubmissions)
        .where(eq(milestoneDeliverableSubmissions.milestoneId, milestoneId))
        .orderBy(desc(milestoneDeliverableSubmissions.submissionVersion), desc(milestoneDeliverableSubmissions.id));
      const files = await tx.select({
        id: milestoneDeliverableSubmissionFiles.id,
        submissionId: milestoneDeliverableSubmissionFiles.submissionId,
        projectFileId: milestoneDeliverableSubmissionFiles.projectFileId,
        sortOrder: milestoneDeliverableSubmissionFiles.sortOrder,
        disabledAt: milestoneDeliverableSubmissionFiles.disabledAt,
        accessPolicyVersion: milestoneDeliverableSubmissionFiles.accessPolicyVersion,
        createdAt: milestoneDeliverableSubmissionFiles.createdAt,
        fileName: projectFiles.fileName,
        mimeType: projectFiles.mimeType,
        sizeBytes: projectFiles.sizeBytes,
        status: projectFiles.status,
        milestoneId: projectFiles.milestoneId,
      }).from(milestoneDeliverableSubmissionFiles)
        .innerJoin(projectFiles, eq(projectFiles.id, milestoneDeliverableSubmissionFiles.projectFileId))
        .where(inArray(milestoneDeliverableSubmissionFiles.submissionId, submissions.map((row) => row.id)))
        .orderBy(asc(milestoneDeliverableSubmissionFiles.sortOrder), asc(milestoneDeliverableSubmissionFiles.id));
      return {
        milestone: prototypeMilestoneSummary(milestone),
        submissions: submissions.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          milestoneId: row.milestoneId,
          submissionVersion: row.submissionVersion,
          note: row.note,
          submittedByProjectMembershipId: row.submittedByProjectMembershipId,
          submittedAt: row.submittedAt,
          requestId: row.requestId,
          status: row.status,
          authorizationVersion: row.authorizationVersion,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          files: files.filter((file) => file.submissionId === row.id).map((file) => ({
            id: file.id,
            submissionId: file.submissionId,
            projectFileId: file.projectFileId,
            sortOrder: file.sortOrder,
            disabledAt: file.disabledAt,
            accessPolicyVersion: file.accessPolicyVersion,
            createdAt: file.createdAt,
            fileName: file.fileName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            status: file.status,
          })),
        })),
      };
    });
  }

  async submitPrototypeDeliverable(accountId: number, input: PrototypeDeliverableInput) {
    const requestId = ensureRequestId(input.requestId);
    const note = cleanText(input.note, "DELIVERABLE_NOTE_INVALID", 5000);
    const fileIds = [...new Set(input.fileIds ?? [])];
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      const currentLatestSubmission = await latestSubmissionForMilestone(tx, milestone.id);
      const currentLatestRound = await latestAcceptanceRoundForMilestone(tx, milestone.id);
      const currentOpenRevision = await openRevisionRequestForMilestone(tx, milestone.id);
      const [existing] = await tx.select().from(milestoneDeliverableSubmissions)
        .where(eq(milestoneDeliverableSubmissions.requestId, requestId)).limit(1);
      if (existing) {
        if (existing.milestoneId !== input.milestoneId) throw new ProjectDesignPrototypeServiceError("IDEMPOTENCY_CONFLICT");
        await createPendingAcceptanceRound(tx, milestone, existing);
        return { submission: existing, project: actor.project, milestone, duplicate: true, revisionResubmission: false };
      }
      let revisionResubmission = false;
      if (milestone.status === "in_progress") {
        const actorCanSubmit = milestone.assigneeProjectMembershipId === actor.membership.id || canManagePrototypeMilestone(actor.roleCodes);
        if (!actorCanSubmit) throw new ProjectDesignPrototypeServiceError("RESOURCE_RELATION_REQUIRED");
      } else if (milestone.status === "submitted") {
        if (!currentLatestSubmission || currentLatestSubmission.status !== "submitted") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
        if (!currentLatestRound || currentLatestRound.submissionId !== currentLatestSubmission.id || currentLatestRound.status !== "revision_requested") {
          throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
        }
        if (!currentOpenRevision || currentOpenRevision.acceptanceRoundId !== currentLatestRound.id) {
          throw new ProjectDesignPrototypeServiceError("REVISION_REQUEST_NOT_FOUND");
        }
        const revisionAssigneeId = currentOpenRevision.assignedProjectMembershipId ?? milestone.assigneeProjectMembershipId;
        const actorCanSubmit = (revisionAssigneeId != null && revisionAssigneeId === actor.membership.id) || canManagePrototypeMilestone(actor.roleCodes);
        if (!actorCanSubmit) throw new ProjectDesignPrototypeServiceError("RESOURCE_RELATION_REQUIRED");
        revisionResubmission = true;
      } else {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      }
      const attachedFiles = [];
      for (const fileId of fileIds) {
        const [file] = await tx.select().from(projectFiles).where(eq(projectFiles.id, fileId)).for("update").limit(1);
        if (!file || file.projectId !== milestone.projectId || file.status !== "available") throw new ProjectDesignPrototypeServiceError("PROJECT_FILE_NOT_FOUND");
        if (file.milestoneId != null && file.milestoneId !== milestone.id) throw new ProjectDesignPrototypeServiceError("RESOURCE_RELATION_REQUIRED");
        attachedFiles.push(file);
      }
      const submissionRows = await tx.select({ submissionVersion: milestoneDeliverableSubmissions.submissionVersion, id: milestoneDeliverableSubmissions.id })
        .from(milestoneDeliverableSubmissions)
        .where(eq(milestoneDeliverableSubmissions.milestoneId, milestone.id))
        .for("update");
      const nextVersion = Math.max(0, ...submissionRows.map((row: { submissionVersion: number }) => row.submissionVersion)) + 1;
      if (submissionRows.length > 0) {
        await tx.update(milestoneDeliverableSubmissions).set({
          status: "superseded",
        }).where(and(eq(milestoneDeliverableSubmissions.milestoneId, milestone.id), eq(milestoneDeliverableSubmissions.status, "submitted")));
      }
      const submissionInsert = await tx.insert(milestoneDeliverableSubmissions).values({
        projectId: milestone.projectId,
        milestoneId: milestone.id,
        submissionVersion: nextVersion,
        note,
        submittedByProjectMembershipId: actor.membership.id,
        submittedAt: new Date(),
        requestId,
        status: "submitted",
        authorizationVersion: 1,
      });
      const submissionId = Number(submissionInsert[0].insertId);
      if (attachedFiles.length > 0) {
        await tx.insert(milestoneDeliverableSubmissionFiles).values(attachedFiles.map((file, index) => ({
          submissionId,
          projectFileId: file.id,
          sortOrder: index,
        })));
        await tx.update(projectFiles).set({
          milestoneId: milestone.id,
          formalSubmission: true,
        }).where(inArray(projectFiles.id, attachedFiles.map((file) => file.id)));
      }
      await tx.update(milestones).set({
        status: "submitted",
        deliveryNote: note,
        submittedAt: new Date(),
        lastSubmittedByProjectMembershipId: actor.membership.id,
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [submission] = await tx.select().from(milestoneDeliverableSubmissions).where(eq(milestoneDeliverableSubmissions.id, submissionId)).limit(1);
      const pendingRound = await createPendingAcceptanceRound(tx, milestone, submission);
      if (revisionResubmission && currentOpenRevision) {
        await tx.update(milestoneRevisionRequests).set({
          status: "resubmitted",
          resolvedBySubmissionId: submissionId,
          authorizationVersion: currentOpenRevision.authorizationVersion + 1,
        }).where(eq(milestoneRevisionRequests.id, currentOpenRevision.id));
      }
      return { submission, project: actor.project, milestone, duplicate: false, revisionResubmission, pendingRound };
    });
    if (!outcome.duplicate) {
      await notifyRecipients(
        outcome.project.id,
        accountId,
        outcome.revisionResubmission ? "返工成果已重新提交" : "成果等待验收",
        outcome.revisionResubmission
          ? `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已重新提交返工成果。`
          : `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已有最新成果等待验收。`,
        `${outcome.revisionResubmission ? "prototype-deliverable-resubmitted" : "prototype-deliverable-pending-review"}:${outcome.submission.id}`,
      );
    }
    return {
      id: outcome.submission.id,
      projectId: outcome.submission.projectId,
      milestoneId: outcome.submission.milestoneId,
      submissionVersion: outcome.submission.submissionVersion,
      note: outcome.submission.note,
      submittedByProjectMembershipId: outcome.submission.submittedByProjectMembershipId,
      submittedAt: outcome.submission.submittedAt,
      requestId: outcome.submission.requestId,
      status: outcome.submission.status,
      authorizationVersion: outcome.submission.authorizationVersion,
      createdAt: outcome.submission.createdAt,
      updatedAt: outcome.submission.updatedAt,
      duplicate: outcome.duplicate,
      revisionResubmission: outcome.revisionResubmission,
    };
  }

  async getAcceptanceStatus(accountId: number, milestoneId: number) {
    const requestId = `prototype-acceptance-status:${milestoneId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, milestoneId);
      await requireProjectActor(tx, milestone.projectId, accountId, requestId, false);
      const latestSubmission = await latestSubmissionForMilestone(tx, milestone.id);
      const latestRound = latestSubmission
        ? (await tx.select().from(milestoneAcceptanceRounds).where(eq(milestoneAcceptanceRounds.submissionId, latestSubmission.id)).limit(1))[0] ?? null
        : null;
      const latestRevisionRequest = await tx.select().from(milestoneRevisionRequests)
        .where(eq(milestoneRevisionRequests.milestoneId, milestone.id))
        .orderBy(desc(milestoneRevisionRequests.id))
        .limit(1);
      return {
        milestone: prototypeMilestoneSummary(milestone),
        latestSubmission: latestSubmission ? {
          id: latestSubmission.id,
          submissionVersion: latestSubmission.submissionVersion,
          status: latestSubmission.status,
          submittedByProjectMembershipId: latestSubmission.submittedByProjectMembershipId,
          submittedAt: latestSubmission.submittedAt,
          authorizationVersion: latestSubmission.authorizationVersion,
        } : null,
        currentRound: latestRound ? acceptanceRoundSummary(latestRound) : null,
        revisionRequest: latestRevisionRequest[0] ? revisionRequestSummary(latestRevisionRequest[0]) : null,
      };
    });
  }

  async listAcceptanceHistory(accountId: number, milestoneId: number) {
    const requestId = `prototype-acceptance-history:${milestoneId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, milestoneId);
      await requireProjectActor(tx, milestone.projectId, accountId, requestId, false);
      const rounds = await tx.select().from(milestoneAcceptanceRounds)
        .where(eq(milestoneAcceptanceRounds.milestoneId, milestone.id))
        .orderBy(desc(milestoneAcceptanceRounds.roundNo), desc(milestoneAcceptanceRounds.id));
      const submissions = await tx.select().from(milestoneDeliverableSubmissions)
        .where(eq(milestoneDeliverableSubmissions.milestoneId, milestone.id))
        .orderBy(desc(milestoneDeliverableSubmissions.submissionVersion), desc(milestoneDeliverableSubmissions.id));
      const revisionRows = rounds.length === 0
        ? []
        : await tx.select().from(milestoneRevisionRequests)
          .where(inArray(milestoneRevisionRequests.acceptanceRoundId, rounds.map((row) => row.id)))
          .orderBy(desc(milestoneRevisionRequests.id));
      return {
        milestone: prototypeMilestoneSummary(milestone),
        rounds: rounds.map((round) => ({
          ...acceptanceRoundSummary(round),
          submissionVersion: submissions.find((submission) => submission.id === round.submissionId)?.submissionVersion ?? null,
          revisionRequest: revisionRows.find((revision) => revision.acceptanceRoundId === round.id)
            ? revisionRequestSummary(revisionRows.find((revision) => revision.acceptanceRoundId === round.id)!)
            : null,
        })),
      };
    });
  }

  async acceptDeliverable(accountId: number, input: PrototypeAcceptanceDecisionInput) {
    const requestId = ensureRequestId(input.requestId);
    const decisionNote = cleanOptionalText(input.decisionNote, 2000);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const [duplicate] = await tx.select().from(milestoneAcceptanceRounds)
        .where(eq(milestoneAcceptanceRounds.requestId, requestId))
        .for("update")
        .limit(1);
      if (duplicate) {
        if (duplicate.milestoneId !== input.milestoneId || duplicate.submissionId !== input.submissionId) {
          throw new ProjectDesignPrototypeServiceError("IDEMPOTENCY_CONFLICT");
        }
        return { round: duplicate, duplicate: true, milestone: await loadPrototypeMilestoneForUpdate(tx, input.milestoneId), project: null as any };
      }
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      if (milestone.status !== "submitted") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      const latestSubmission = await latestSubmissionForMilestone(tx, milestone.id);
      if (!latestSubmission || latestSubmission.id !== input.submissionId || latestSubmission.status !== "submitted") {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      }
      if (latestSubmission.submittedByProjectMembershipId === actor.membership.id) {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_SELF_REVIEW_FORBIDDEN");
      }
      const [round] = await tx.select().from(milestoneAcceptanceRounds)
        .where(eq(milestoneAcceptanceRounds.submissionId, latestSubmission.id))
        .for("update")
        .limit(1);
      if (!round) throw new ProjectDesignPrototypeServiceError("ACCEPTANCE_ROUND_NOT_FOUND");
      if (round.status === "accepted" && round.requestId === requestId) return { round, duplicate: true, milestone, project: actor.project };
      if (round.status !== "pending_review") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      await tx.update(milestoneAcceptanceRounds).set({
        status: "accepted",
        reviewerProjectMembershipId: actor.membership.id,
        decisionNote,
        requestId,
        decidedAt: new Date(),
        authorizationVersion: round.authorizationVersion + 1,
      }).where(eq(milestoneAcceptanceRounds.id, round.id));
      const openRevision = await openRevisionRequestForMilestone(tx, milestone.id);
      if (openRevision) {
        await tx.update(milestoneRevisionRequests).set({
          status: "closed",
          authorizationVersion: openRevision.authorizationVersion + 1,
        }).where(eq(milestoneRevisionRequests.id, openRevision.id));
      }
      await tx.update(milestones).set({
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [updated] = await tx.select().from(milestoneAcceptanceRounds).where(eq(milestoneAcceptanceRounds.id, round.id)).limit(1);
      return { round: updated, duplicate: false, milestone, project: actor.project };
    });
    if (!outcome.duplicate && outcome.project) {
      await notifyRecipients(
        outcome.project.id,
        accountId,
        "原型成果验收通过",
        `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已验收通过。`,
        `prototype-acceptance-accepted:${outcome.round.id}`,
      );
    }
    return acceptanceRoundSummary(outcome.round);
  }

  async requestRevision(accountId: number, input: PrototypeRevisionRequestInput) {
    const requestId = ensureRequestId(input.requestId);
    const reason = cleanText(input.reason, "REVISION_REASON_INVALID", 2000);
    const requirements = sanitizeRequirements(input.requirements);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const [duplicateRevision] = await tx.select().from(milestoneRevisionRequests)
        .where(eq(milestoneRevisionRequests.requestId, requestId))
        .for("update")
        .limit(1);
      if (duplicateRevision) {
        if (duplicateRevision.milestoneId !== input.milestoneId) throw new ProjectDesignPrototypeServiceError("IDEMPOTENCY_CONFLICT");
        return { revision: duplicateRevision, duplicate: true, milestone: await loadPrototypeMilestoneForUpdate(tx, input.milestoneId), project: null as any };
      }
      const milestone = await loadPrototypeMilestoneForUpdate(tx, input.milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, true);
      assertProjectActive(actor.project.status);
      if (milestone.status !== "submitted") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      assertExpectedVersion(milestone.authorizationVersion, input.expectedAuthorizationVersion);
      const latestSubmission = await latestSubmissionForMilestone(tx, milestone.id);
      if (!latestSubmission || latestSubmission.id !== input.submissionId || latestSubmission.status !== "submitted") {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      }
      if (latestSubmission.submittedByProjectMembershipId === actor.membership.id) {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_SELF_REVIEW_FORBIDDEN");
      }
      const [round] = await tx.select().from(milestoneAcceptanceRounds)
        .where(eq(milestoneAcceptanceRounds.submissionId, latestSubmission.id))
        .for("update")
        .limit(1);
      if (!round) throw new ProjectDesignPrototypeServiceError("ACCEPTANCE_ROUND_NOT_FOUND");
      if (round.status !== "pending_review") throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      let assigneeMembershipId = input.assigneeProjectMembershipId ?? milestone.assigneeProjectMembershipId ?? null;
      if (assigneeMembershipId != null) {
        await requireTargetMembership(tx, milestone.projectId, assigneeMembershipId);
      }
      await tx.update(milestoneAcceptanceRounds).set({
        status: "revision_requested",
        reviewerProjectMembershipId: actor.membership.id,
        decisionNote: reason,
        requestId,
        decidedAt: new Date(),
        authorizationVersion: round.authorizationVersion + 1,
      }).where(eq(milestoneAcceptanceRounds.id, round.id));
      const revisionInsert = await tx.insert(milestoneRevisionRequests).values({
        projectId: milestone.projectId,
        milestoneId: milestone.id,
        acceptanceRoundId: round.id,
        reason,
        requirementsJson: requirements.length > 0 ? requirements : null,
        assignedProjectMembershipId: assigneeMembershipId,
        dueAt: input.dueAt ?? null,
        status: "open",
        createdByProjectMembershipId: actor.membership.id,
        requestId,
        authorizationVersion: 1,
      });
      await tx.update(milestones).set({
        authorizationVersion: milestone.authorizationVersion + 1,
      }).where(eq(milestones.id, milestone.id));
      const [revision] = await tx.select().from(milestoneRevisionRequests)
        .where(eq(milestoneRevisionRequests.id, Number(revisionInsert[0].insertId)))
        .limit(1);
      return { revision, duplicate: false, milestone, project: actor.project };
    });
    if (!outcome.duplicate && outcome.project) {
      await notifyRecipients(
        outcome.project.id,
        accountId,
        "成果要求返工",
        `项目「${outcome.project.title}」的原型里程碑「${outcome.milestone.title}」已提出返工要求。`,
        `prototype-acceptance-revision-requested:${outcome.revision.id}`,
      );
    }
    return revisionRequestSummary(outcome.revision);
  }

  async getRevisionRequest(accountId: number, milestoneId: number) {
    const requestId = `prototype-revision-request:${milestoneId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, milestoneId);
      await requireProjectActor(tx, milestone.projectId, accountId, requestId, false);
      const [revision] = await tx.select().from(milestoneRevisionRequests)
        .where(eq(milestoneRevisionRequests.milestoneId, milestone.id))
        .orderBy(desc(milestoneRevisionRequests.id))
        .limit(1);
      if (!revision) throw new ProjectDesignPrototypeServiceError("REVISION_REQUEST_NOT_FOUND");
      return revisionRequestSummary(revision);
    });
  }

  async prototypeDeliverableSubmitContext(accountId: number, milestoneId: number) {
    const requestId = `prototype-deliverable-submit-context:${milestoneId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const milestone = await loadPrototypeMilestoneForUpdate(tx, milestoneId);
      const actor = await requireProjectActor(tx, milestone.projectId, accountId, requestId, false);
      let capabilityCode: "project.milestone.submit_deliverable" | "project.prototype_revision.submit" = "project.milestone.submit_deliverable";
      if (milestone.status === "submitted") {
        const latestRound = await latestAcceptanceRoundForMilestone(tx, milestone.id);
        const openRevision = await openRevisionRequestForMilestone(tx, milestone.id);
        if (!latestRound || latestRound.status !== "revision_requested" || !openRevision) {
          throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
        }
        capabilityCode = "project.prototype_revision.submit";
      } else if (milestone.status !== "in_progress") {
        throw new ProjectDesignPrototypeServiceError("RESOURCE_STATE_FORBIDDEN");
      }
      return {
        projectId: milestone.projectId,
        milestoneAuthorizationVersion: milestone.authorizationVersion,
        capabilityCode,
        membershipId: actor.membership.id,
      };
    });
  }

  async registerProjectIntention(accountId: number, input: ProjectIntentionRegisterInput) {
    const requestId = ensureRequestId(input.requestId);
    const note = validateIntentionNote(input.note);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const [existingByRequest] = await tx.select().from(projectIntentions)
        .where(eq(projectIntentions.requestId, requestId))
        .for("update")
        .limit(1);
      if (existingByRequest) {
        if (existingByRequest.projectId !== input.projectId || existingByRequest.accountId !== accountId || existingByRequest.intentionType !== input.intentionType) {
          throw new ProjectDesignPrototypeServiceError("IDEMPOTENCY_CONFLICT");
        }
        return { intention: existingByRequest, duplicate: true, project: null as any };
      }
      const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project || !(ACTIVE_PROJECT_STATUSES.has(project.status) || project.status === "completed")) {
        throw new ProjectDesignPrototypeServiceError("PROJECT_NOT_FOUND");
      }
      const dedupeKey = activeIntentionKey(project.id, accountId, input.intentionType);
      const [activeExisting] = await tx.select().from(projectIntentions)
        .where(eq(projectIntentions.activeDedupeKey, dedupeKey))
        .for("update")
        .limit(1);
      if (activeExisting) return { intention: activeExisting, duplicate: true, project };
      const result = await tx.insert(projectIntentions).values({
        projectId: project.id,
        accountId,
        intentionType: input.intentionType,
        note,
        status: "active",
        activeDedupeKey: dedupeKey,
        requestId,
        lastRequestId: requestId,
      });
      const [created] = await tx.select().from(projectIntentions).where(eq(projectIntentions.id, Number(result[0].insertId))).limit(1);
      return { intention: created, duplicate: false, project };
    });
    if (!outcome.duplicate && outcome.project && HIGH_VALUE_INTENTION_TYPES.has(outcome.intention.intentionType)) {
      try {
        const recipients = [...new Set([...(await projectManagerAccountIds(outcome.project.id)), outcome.project.ownerId, outcome.project.engineerId].filter((value): value is number => Number.isInteger(value) && value > 0))];
        await Promise.all(recipients.map((userId) => createNotification({
          userId,
          category: "project",
          title: outcome.intention.intentionType === "trial" ? "用户登记试用意向" : outcome.intention.intentionType === "purchase_interest" ? "用户登记购买意向" : "用户登记合作意向",
          content: `项目「${outcome.project.title}」收到新的${outcome.intention.intentionType === "trial" ? "试用" : outcome.intention.intentionType === "purchase_interest" ? "购买" : "合作"}意向登记。`,
          refType: "project",
          refId: outcome.project.id,
          dedupeKey: `project:${outcome.project.id}:intention:${outcome.intention.id}:${userId}`,
        }).catch(() => undefined)));
      } catch {
        // Notification failure must not roll back the business transaction.
      }
    }
    return {
      id: outcome.intention.id,
      projectId: outcome.intention.projectId,
      accountId: outcome.intention.accountId,
      intentionType: outcome.intention.intentionType,
      note: outcome.intention.note,
      status: outcome.intention.status,
      createdAt: outcome.intention.createdAt,
      updatedAt: outcome.intention.updatedAt,
      duplicate: outcome.duplicate,
    };
  }

  async withdrawProjectIntention(accountId: number, input: ProjectIntentionWithdrawInput) {
    const requestId = ensureRequestId(input.requestId);
    const db = await requireDb();
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(projectIntentions)
        .where(eq(projectIntentions.id, input.intentionId))
        .for("update")
        .limit(1);
      if (!row || row.accountId !== accountId) throw new ProjectDesignPrototypeServiceError("PROJECT_INTENTION_NOT_FOUND");
      if (row.status === "withdrawn" || row.lastRequestId === requestId) {
        return { intention: row, duplicate: true, project: null as any };
      }
      await tx.update(projectIntentions).set({
        status: "withdrawn",
        activeDedupeKey: null,
        lastRequestId: requestId,
      }).where(eq(projectIntentions.id, row.id));
      const [updated] = await tx.select().from(projectIntentions).where(eq(projectIntentions.id, row.id)).limit(1);
      const [project] = await tx.select().from(projects).where(eq(projects.id, updated.projectId)).limit(1);
      return { intention: updated, duplicate: false, project };
    });
    if (!outcome.duplicate && outcome.project && HIGH_VALUE_INTENTION_TYPES.has(outcome.intention.intentionType)) {
      try {
        const recipients = [...new Set([...(await projectManagerAccountIds(outcome.project.id)), outcome.project.ownerId, outcome.project.engineerId].filter((value): value is number => Number.isInteger(value) && value > 0))];
        await Promise.all(recipients.map((userId) => createNotification({
          userId,
          category: "project",
          title: "用户撤回意向",
          content: `项目「${outcome.project.title}」有一条高价值意向已被撤回。`,
          refType: "project",
          refId: outcome.project.id,
          dedupeKey: `project:${outcome.project.id}:intention-withdrawn:${outcome.intention.id}:${userId}`,
        }).catch(() => undefined)));
      } catch {
        // Notification failure must not roll back the business transaction.
      }
    }
    return {
      id: outcome.intention.id,
      projectId: outcome.intention.projectId,
      intentionType: outcome.intention.intentionType,
      status: outcome.intention.status,
      updatedAt: outcome.intention.updatedAt,
      duplicate: outcome.duplicate,
    };
  }

  async listMyProjectIntentions(accountId: number) {
    const db = await requireDb();
    const rows = await db.select({
      id: projectIntentions.id,
      projectId: projectIntentions.projectId,
      intentionType: projectIntentions.intentionType,
      note: projectIntentions.note,
      status: projectIntentions.status,
      createdAt: projectIntentions.createdAt,
      updatedAt: projectIntentions.updatedAt,
      projectTitle: projects.title,
      projectStatus: projects.status,
    }).from(projectIntentions)
      .innerJoin(projects, eq(projects.id, projectIntentions.projectId))
      .where(eq(projectIntentions.accountId, accountId))
      .orderBy(desc(projectIntentions.createdAt), desc(projectIntentions.id));
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      projectStatus: row.projectStatus,
      intentionType: row.intentionType,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listProjectIntentions(accountId: number, projectId: number) {
    const requestId = `project-intentions:${projectId}:${accountId}`;
    const db = await requireDb();
    return db.transaction(async (tx) => {
      await requireProjectActor(tx, projectId, accountId, requestId, false);
      const rows = await tx.select({
        id: projectIntentions.id,
        intentionType: projectIntentions.intentionType,
        note: projectIntentions.note,
        status: projectIntentions.status,
        createdAt: projectIntentions.createdAt,
        displayName: userProfiles.nickname,
        avatarUrl: userProfiles.avatarUrl,
        cityName: userProfiles.cityName,
        accountName: users.name,
      }).from(projectIntentions)
        .innerJoin(users, eq(users.id, projectIntentions.accountId))
        .leftJoin(userProfiles, eq(userProfiles.userId, projectIntentions.accountId))
        .where(and(eq(projectIntentions.projectId, projectId), eq(projectIntentions.status, "active")))
        .orderBy(desc(projectIntentions.createdAt), desc(projectIntentions.id));
      return rows.map((row) => ({
        id: row.id,
        intentionType: row.intentionType,
        note: row.note,
        status: row.status,
        createdAt: row.createdAt,
        displayName: row.displayName?.trim() || row.accountName?.trim() || "用户",
        avatarUrl: row.avatarUrl,
        cityName: row.cityName,
      }));
    });
  }

  async projectIntentionSummary(projectId: number) {
    const db = await requireDb();
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) throw new ProjectDesignPrototypeServiceError("PROJECT_NOT_FOUND");
    const rows = await db.select({
      intentionType: projectIntentions.intentionType,
      status: projectIntentions.status,
    }).from(projectIntentions).where(and(eq(projectIntentions.projectId, projectId), eq(projectIntentions.status, "active")));
    const counts = {
      follow: 0,
      trial: 0,
      purchase_interest: 0,
      collaboration_interest: 0,
    };
    rows.forEach((row) => {
      if (row.intentionType in counts) counts[row.intentionType as keyof typeof counts] += 1;
    });
    return { projectId, counts };
  }

  async designVersionFileAccessContext(accountId: number, designVersionFileId: number) {
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [file] = await tx.select().from(designVersionFiles).where(eq(designVersionFiles.id, designVersionFileId)).limit(1);
      if (!file) throw new ProjectDesignPrototypeServiceError("DESIGN_VERSION_FILE_NOT_FOUND");
      const [version] = await tx.select().from(designVersions).where(eq(designVersions.id, file.designVersionId)).limit(1);
      if (!version) throw new ProjectDesignPrototypeServiceError("DESIGN_VERSION_NOT_FOUND");
      const actor = await requireProjectActor(tx, version.projectId, accountId, `design-file-access:${designVersionFileId}:${accountId}`, false);
      const { projectFile, storedFile } = await loadStoredFileByProjectFile(tx, file.projectFileId);
      return { actor, version, file, projectFile, storedFile };
    });
  }

  async deliverableFileAccessContext(accountId: number, submissionFileId: number) {
    const db = await requireDb();
    return db.transaction(async (tx) => {
      const [file] = await tx.select().from(milestoneDeliverableSubmissionFiles).where(eq(milestoneDeliverableSubmissionFiles.id, submissionFileId)).limit(1);
      if (!file) throw new ProjectDesignPrototypeServiceError("DELIVERABLE_FILE_NOT_FOUND");
      const [submission] = await tx.select().from(milestoneDeliverableSubmissions).where(eq(milestoneDeliverableSubmissions.id, file.submissionId)).limit(1);
      if (!submission) throw new ProjectDesignPrototypeServiceError("DELIVERABLE_SUBMISSION_NOT_FOUND");
      const actor = await requireProjectActor(tx, submission.projectId, accountId, `deliverable-file-access:${submissionFileId}:${accountId}`, false);
      const { projectFile, storedFile } = await loadStoredFileByProjectFile(tx, file.projectFileId);
      return { actor, submission, file, projectFile, storedFile };
    });
  }
}

export const projectDesignPrototypeService = new ProjectDesignPrototypeService();
