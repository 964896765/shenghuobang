import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { authorizeOrThrow } from "../authorization";
import { protectedProcedure, router } from "../_core/trpc";
import { projectDesignPrototypeService, ProjectDesignPrototypeServiceError } from "../services/project-design-prototype-service";

const positiveId = z.number().int().positive();
const requestId = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/);

function mapError(cause: unknown): never {
  if (cause instanceof TRPCError) throw cause;
  const code = cause instanceof ProjectDesignPrototypeServiceError ? cause.code : "INTERNAL_SERVER_ERROR";
  if (["PROJECT_NOT_FOUND", "MILESTONE_NOT_FOUND", "ACCEPTANCE_ROUND_NOT_FOUND", "REVISION_REQUEST_NOT_FOUND", "PROJECT_INTENTION_NOT_FOUND"].includes(code)) {
    throw new TRPCError({ code: "NOT_FOUND", message: code });
  }
  if (["PROJECT_MEMBERSHIP_INACTIVE", "RESOURCE_RELATION_REQUIRED", "PROJECT_INACTIVE", "RESOURCE_SELF_REVIEW_FORBIDDEN"].includes(code)) {
    throw new TRPCError({ code: "FORBIDDEN", message: code });
  }
  if (["CONCURRENT_MODIFICATION", "IDEMPOTENCY_CONFLICT"].includes(code)) {
    throw new TRPCError({ code: "CONFLICT", message: code });
  }
  if (["REQUEST_ID_INVALID", "PROTOTYPE_MILESTONE_REQUIRED", "RESOURCE_STATE_FORBIDDEN", "REVISION_REASON_INVALID", "REVISION_REQUIREMENTS_INVALID", "INTENTION_NOTE_INVALID", "TEXT_INVALID"].includes(code)) {
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

async function authorizeAcceptanceRead(accountId: number, projectId: number, milestoneId: number, milestoneAuthorizationVersion: number) {
  try {
    await authorizeOrThrow(accountId, {
      capabilityCode: "project.prototype_acceptance.view",
      projectId,
      resourceType: "milestone",
      resourceId: String(milestoneId),
      expectedResourceVersion: milestoneAuthorizationVersion,
      purpose: "project_prototype_acceptance_view",
    });
    return;
  } catch (cause) {
    if (!(cause instanceof TRPCError) || cause.code !== "FORBIDDEN") throw cause;
  }
  await authorizeOrThrow(accountId, {
    capabilityCode: "project.prototype_acceptance.review",
    projectId,
    resourceType: "milestone",
    resourceId: String(milestoneId),
    expectedResourceVersion: milestoneAuthorizationVersion,
    purpose: "project_prototype_acceptance_review",
  });
}

export const prototypeAcceptancesRouter = router({
  status: protectedProcedure.input(z.object({ milestoneId: positiveId }).strict()).query(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeAcceptanceRead(ctx.user.id, detail.milestone.projectId, input.milestoneId, detail.milestone.authorizationVersion);
    return projectDesignPrototypeService.getAcceptanceStatus(ctx.user.id, input.milestoneId);
  })),

  history: protectedProcedure.input(z.object({ milestoneId: positiveId }).strict()).query(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeAcceptanceRead(ctx.user.id, detail.milestone.projectId, input.milestoneId, detail.milestone.authorizationVersion);
    return projectDesignPrototypeService.listAcceptanceHistory(ctx.user.id, input.milestoneId);
  })),

  accept: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    submissionId: positiveId,
    decisionNote: z.string().trim().max(2000).optional(),
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "project.prototype_acceptance.accept",
      projectId: detail.milestone.projectId,
      resourceType: "milestone",
      resourceId: String(input.milestoneId),
      expectedResourceVersion: detail.milestone.authorizationVersion,
      purpose: "project_prototype_acceptance_accept",
      requestId: input.requestId,
    });
    return projectDesignPrototypeService.acceptDeliverable(ctx.user.id, input);
  })),

  requestRevision: protectedProcedure.input(z.object({
    milestoneId: positiveId,
    submissionId: positiveId,
    reason: z.string().trim().min(1).max(2000),
    requirements: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    assigneeProjectMembershipId: positiveId.optional(),
    dueAt: z.coerce.date().optional(),
    expectedAuthorizationVersion: z.number().int().positive().optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "project.prototype_acceptance.request_revision",
      projectId: detail.milestone.projectId,
      resourceType: "milestone",
      resourceId: String(input.milestoneId),
      expectedResourceVersion: detail.milestone.authorizationVersion,
      purpose: "project_prototype_acceptance_request_revision",
      requestId: input.requestId,
    });
    return projectDesignPrototypeService.requestRevision(ctx.user.id, input);
  })),

  revisionRequest: protectedProcedure.input(z.object({ milestoneId: positiveId }).strict()).query(async ({ ctx, input }) => call(async () => {
    const detail = await projectDesignPrototypeService.prototypeMilestoneDetail(ctx.user.id, input.milestoneId);
    await authorizeAcceptanceRead(ctx.user.id, detail.milestone.projectId, input.milestoneId, detail.milestone.authorizationVersion);
    return projectDesignPrototypeService.getRevisionRequest(ctx.user.id, input.milestoneId);
  })),
});

export const projectIntentionsRouter = router({
  register: protectedProcedure.input(z.object({
    projectId: positiveId,
    intentionType: z.enum(["follow", "trial", "purchase_interest", "collaboration_interest"]),
    note: z.string().trim().max(500).optional(),
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.intention.register", purpose: "project_intention_register", requestId: input.requestId });
    return call(() => projectDesignPrototypeService.registerProjectIntention(ctx.user.id, input));
  }),

  withdraw: protectedProcedure.input(z.object({
    intentionId: positiveId,
    requestId,
  }).strict()).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "project.intention.withdraw", purpose: "project_intention_withdraw", requestId: input.requestId });
    return call(() => projectDesignPrototypeService.withdrawProjectIntention(ctx.user.id, input));
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => call(() => projectDesignPrototypeService.listMyProjectIntentions(ctx.user.id))),

  listProject: protectedProcedure.input(z.object({ projectId: positiveId }).strict()).query(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "project.intention.view_project",
      projectId: input.projectId,
      resourceType: "project",
      resourceId: String(input.projectId),
      purpose: "project_intention_view_project",
    });
    return call(() => projectDesignPrototypeService.listProjectIntentions(ctx.user.id, input.projectId));
  }),

  summary: protectedProcedure.input(z.object({ projectId: positiveId }).strict()).query(async ({ ctx, input }) => {
    const eligibility = await call(() => projectDesignPrototypeService.resolveProjectIntentionEligibility(ctx.user.id, input.projectId));
    if (eligibility.isMember) {
      await authorizeOrThrow(ctx.user.id, {
        capabilityCode: "project.intention.view_project",
        projectId: input.projectId,
        resourceType: "project",
        resourceId: String(input.projectId),
        purpose: "project_intention_summary",
      });
    }
    return call(() => projectDesignPrototypeService.projectIntentionSummary(ctx.user.id, input.projectId));
  }),
});
