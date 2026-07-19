import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { authorizeOrThrow } from "../authorization";
import { projectDesignPrototypeService, ProjectDesignPrototypeServiceError } from "../services/project-design-prototype-service";
import {
  buildDesignVersionFileAccessToken,
  buildPrototypeDeliverableFileAccessToken,
  createDesignVersionFileAccessPath,
  createPrototypeDeliverableFileAccessPath,
} from "../_core/projectDesignPrototypeFileAccess";

const positiveId = z.number().int().positive();
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const cursor = z.number().int().positive();
const limit = z.number().int().min(1).max(50).default(20);
const shortLimit = z.number().int().min(1).max(20).default(20);
const confidentiality = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"]);
const fileRole = z.enum(["source", "preview", "reference", "specification", "other"]);
const taskType = z.enum(["designer", "engineer"]);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof ProjectDesignPrototypeServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
  if (["PROJECT_NOT_FOUND", "DESIGN_VERSION_NOT_FOUND", "DESIGN_VERSION_FILE_NOT_FOUND", "MILESTONE_NOT_FOUND", "PROJECT_FILE_NOT_FOUND", "FILE_NOT_FOUND", "DELIVERABLE_FILE_NOT_FOUND", "DELIVERABLE_SUBMISSION_NOT_FOUND", "ACCEPTANCE_ROUND_NOT_FOUND", "REVISION_REQUEST_NOT_FOUND", "PROJECT_INTENTION_NOT_FOUND"].includes(code)) {
    throw new TRPCError({ code: "NOT_FOUND", message: code });
  }
  if (["PROJECT_MEMBERSHIP_INACTIVE", "RESOURCE_RELATION_REQUIRED", "PROJECT_INACTIVE", "RESOURCE_SELF_REVIEW_FORBIDDEN"].includes(code)) {
    throw new TRPCError({ code: "FORBIDDEN", message: code });
  }
  if (["CONCURRENT_MODIFICATION", "IDEMPOTENCY_CONFLICT"].includes(code)) {
    throw new TRPCError({ code: "CONFLICT", message: code });
  }
  if (["TITLE_INVALID", "SUMMARY_INVALID", "DELIVERABLE_NOTE_INVALID", "REQUEST_ID_INVALID", "PROTOTYPE_MILESTONE_REQUIRED", "MILESTONE_ASSIGNEE_INVALID", "MILESTONE_TASK_TYPE_INVALID", "DESIGN_VERSION_FILES_REQUIRED", "RESOURCE_STATE_FORBIDDEN", "REVISION_REASON_INVALID", "REVISION_REQUIREMENTS_INVALID", "INTENTION_NOTE_INVALID", "TEXT_INVALID"].includes(code)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: code });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: code });
}

async function call<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (cause) {
    mapError(cause);
  }
}

export const designVersionsRouter = router({
  createDraft: protectedProcedure.input(z.object({
    projectId: positiveId,
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().min(1).max(500),
    changeNotes: z.string().trim().max(5000).optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.create", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId), purpose: "project_design_version_create", requestId: input.requestId });
    return call(() => projectDesignPrototypeService.createDesignVersionDraft(ctx.user.id, input));
  }),

  updateDraft: protectedProcedure.input(z.object({
    designVersionId: positiveId,
    title: z.string().trim().min(1).max(255).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
    changeNotes: z.string().trim().max(5000).optional(),
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.designVersionDetail(ctx.user.id, input.designVersionId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.edit", projectId: detail.version.projectId, resourceType: "project", resourceId: String(detail.version.projectId), purpose: "project_design_version_edit", requestId: input.requestId });
    return projectDesignPrototypeService.updateDesignVersionDraft(ctx.user.id, input);
  })),

  list: protectedProcedure.input(z.object({
    projectId: positiveId,
    limit: shortLimit.optional(),
    cursor: cursor.optional(),
  }).strict()).query(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.view", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId), purpose: "project_design_version_list" });
    return call(() => projectDesignPrototypeService.listDesignVersions(ctx.user.id, input.projectId, input.limit, input.cursor));
  }),

  detail: protectedProcedure.input(z.object({ designVersionId: positiveId }).strict()).query(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.designVersionDetail(ctx.user.id, input.designVersionId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.view", projectId: detail.version.projectId, resourceType: "project", resourceId: String(detail.version.projectId), purpose: "project_design_version_detail" });
    return detail;
  })),

  uploadFile: protectedProcedure.input(z.object({
    designVersionId: positiveId,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(128).optional(),
    base64Data: z.string().min(1),
    fileRole,
    sortOrder: z.number().int().min(0).max(9999).optional(),
    description: z.string().trim().max(1000).optional(),
    confidentialityLevel: confidentiality.optional(),
    ndaRequired: z.boolean().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.designVersionDetail(ctx.user.id, input.designVersionId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_file.upload", projectId: detail.version.projectId, resourceType: "project", resourceId: String(detail.version.projectId), purpose: "project_design_file_upload", requestId: input.requestId });
    return projectDesignPrototypeService.uploadDesignVersionFile(ctx.user.id, input);
  })),

  disableFile: protectedProcedure.input(z.object({
    designVersionFileId: positiveId,
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const access = await projectDesignPrototypeService.designVersionFileAccessContext(ctx.user.id, input.designVersionFileId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.edit", projectId: access.actor.project.id, resourceType: "project", resourceId: String(access.actor.project.id), purpose: "project_design_file_disable", requestId: input.requestId });
    return projectDesignPrototypeService.disableDesignVersionFile(ctx.user.id, input.designVersionFileId, input.requestId);
  })),

  submit: protectedProcedure.input(z.object({
    designVersionId: positiveId,
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.designVersionDetail(ctx.user.id, input.designVersionId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.submit", projectId: detail.version.projectId, resourceType: "project", resourceId: String(detail.version.projectId), purpose: "project_design_version_submit", requestId: input.requestId });
    return projectDesignPrototypeService.submitDesignVersion(ctx.user.id, input.designVersionId, input.expectedAuthorizationVersion, input.requestId);
  })),

  withdraw: protectedProcedure.input(z.object({
    designVersionId: positiveId,
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.designVersionDetail(ctx.user.id, input.designVersionId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.design_version.edit", projectId: detail.version.projectId, resourceType: "project", resourceId: String(detail.version.projectId), purpose: "project_design_version_withdraw", requestId: input.requestId });
    return projectDesignPrototypeService.withdrawDesignVersion(ctx.user.id, input.designVersionId, input.expectedAuthorizationVersion, input.requestId);
  })),

  fileAccess: protectedProcedure.input(z.object({
    designVersionFileId: positiveId,
    purpose: z.enum(["download", "preview"]).default("download"),
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const access = await projectDesignPrototypeService.designVersionFileAccessContext(ctx.user.id, input.designVersionFileId);
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "project.design_file.download",
      projectId: access.actor.project.id,
      resourceType: "project_file",
      resourceId: String(access.projectFile.id),
      expectedResourceVersion: access.projectFile.accessPolicyVersion,
      purpose: "project_design_file_access",
    });
    const token = buildDesignVersionFileAccessToken({
      accountId: ctx.user.id,
      projectId: access.actor.project.id,
      designVersionId: access.version.id,
      projectFileId: access.projectFile.id,
      fileId: access.storedFile.id,
      purpose: input.purpose,
      projectAuthorizationVersion: access.actor.project.authorizationVersion,
      entityAuthorizationVersion: access.version.authorizationVersion,
      entityFileAccessPolicyVersion: access.file.accessPolicyVersion,
      projectFileAccessPolicyVersion: access.projectFile.accessPolicyVersion,
      storedFileAccessPolicyVersion: access.storedFile.accessPolicyVersion,
    });
    return { path: createDesignVersionFileAccessPath(input.designVersionFileId, token) };
  })),
});

export const prototypeMilestonesRouter = router({
  create: protectedProcedure.input(z.object({
    projectId: positiveId,
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    prototypeTaskType: taskType,
    assigneeProjectMembershipId: positiveId.optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.milestone.create", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId), purpose: "project_prototype_milestone_create", requestId: input.requestId });
    return call(() => projectDesignPrototypeService.createPrototypeMilestone(ctx.user.id, input));
  }),

  update: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    prototypeTaskType: taskType.optional(),
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.milestone.edit", projectId: detail.milestone.projectId, resourceType: "milestone", resourceId: String(input.milestoneId), expectedResourceVersion: detail.milestone.authorizationVersion, purpose: "project_prototype_milestone_edit", requestId: input.requestId });
    return projectDesignPrototypeService.updatePrototypeMilestone(ctx.user.id, input);
  })),

  assign: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    assigneeProjectMembershipId: positiveId,
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.milestone.assign", projectId: detail.milestone.projectId, resourceType: "milestone", resourceId: String(input.milestoneId), expectedResourceVersion: detail.milestone.authorizationVersion, purpose: "project_prototype_milestone_assign", requestId: input.requestId });
    return projectDesignPrototypeService.assignPrototypeMilestone(ctx.user.id, input);
  })),

  start: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.milestone.start", projectId: detail.milestone.projectId, resourceType: "milestone", resourceId: String(input.milestoneId), expectedResourceVersion: detail.milestone.authorizationVersion, purpose: "project_prototype_milestone_start", requestId: input.requestId });
    return projectDesignPrototypeService.startPrototypeMilestone(ctx.user.id, input);
  })),

  list: protectedProcedure.input(z.object({
    projectId: positiveId,
    limit: limit.optional(),
    cursor: cursor.optional(),
  }).strict()).query(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.view", projectId: input.projectId, resourceType: "project", resourceId: String(input.projectId), purpose: "project_prototype_milestone_list" });
    return call(() => projectDesignPrototypeService.listPrototypeMilestones(ctx.user.id, input.projectId, input.limit, input.cursor));
  }),

  detail: protectedProcedure.input(z.object({ milestoneId: positiveId }).strict()).query(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.view", projectId: detail.milestone.projectId, resourceType: "milestone", resourceId: String(input.milestoneId), expectedResourceVersion: detail.milestone.authorizationVersion, purpose: "project_prototype_milestone_detail" });
    return detail;
  })),

  submitDeliverable: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    note: z.string().trim().min(1).max(5000),
    fileIds: z.array(positiveId).max(20).optional(),
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const submitContext = await projectDesignPrototypeService.prototypeDeliverableSubmitContext(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: submitContext.capabilityCode,
      projectId: submitContext.projectId,
      resourceType: "milestone",
      resourceId: String(input.milestoneId),
      expectedResourceVersion: submitContext.milestoneAuthorizationVersion,
      purpose: "project_prototype_milestone_submit_deliverable",
      requestId: input.requestId,
    });
    return projectDesignPrototypeService.submitPrototypeDeliverable(ctx.user.id, input);
  })),

  deliverableFileAccess: protectedProcedure.input(z.object({
    submissionFileId: positiveId,
    purpose: z.enum(["download", "preview"]).default("download"),
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const access = await projectDesignPrototypeService.deliverableFileAccessContext(ctx.user.id, input.submissionFileId);
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "project.file.download",
      projectId: access.actor.project.id,
      resourceType: "project_file",
      resourceId: String(access.projectFile.id),
      expectedResourceVersion: access.projectFile.accessPolicyVersion,
      purpose: "project_prototype_deliverable_file_access",
    });
    const token = buildPrototypeDeliverableFileAccessToken({
      accountId: ctx.user.id,
      projectId: access.actor.project.id,
      milestoneSubmissionId: access.submission.id,
      projectFileId: access.projectFile.id,
      fileId: access.storedFile.id,
      purpose: input.purpose,
      projectAuthorizationVersion: access.actor.project.authorizationVersion,
      entityAuthorizationVersion: access.submission.authorizationVersion,
      entityFileAccessPolicyVersion: access.file.accessPolicyVersion,
      projectFileAccessPolicyVersion: access.projectFile.accessPolicyVersion,
      storedFileAccessPolicyVersion: access.storedFile.accessPolicyVersion,
    });
    return { path: createPrototypeDeliverableFileAccessPath(input.submissionFileId, token) };
  })),
});
