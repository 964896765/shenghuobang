import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as complaints from "../services/complaint-service";
import { writeAudit } from "../services/audit-service";
import * as db from "../db";
import { authorizeOrThrow, getAuthorizationService, serializeAuthorized } from "../authorization";

function requestId(ctx: { req: { headers: Record<string, string | string[] | undefined> } }) {
  const value = ctx.req.headers["x-request-id"];
  return typeof value === "string" ? value.slice(0, 64) : null;
}

export const complaintsRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.listComplaintsForUser(ctx.user.id)),
  detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) =>
    complaints.complaintDetail(input.id, ctx.user.id)),
  create: protectedProcedure.input(z.object({
    relatedType: z.enum(["project", "milestone"]), relatedId: z.number().int().positive(),
    complaintType: z.string().trim().min(2).max(64), description: z.string().trim().min(5).max(3000),
    expectedResolution: z.string().max(1000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const result = await complaints.createComplaintAndFreeze({ ...input, complainantId: ctx.user.id });
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "escrow.freeze.complaint", resourceType: "complaint", resourceId: result.complaintId, riskLevel: "high", detail: { projectId: result.projectId }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    await db.createNotification({ userId: result.respondentId, category: "project", title: "收到投诉/争议", content: "对方已发起投诉，相关托管或结算已冻结，请进入投诉详情回应。", refType: "complaint", refId: result.complaintId });
    return { id: result.complaintId };
  }),
  respond: protectedProcedure.input(z.object({ id: z.number().int().positive(), statement: z.string().trim().min(2).max(3000) })).mutation(async ({ ctx, input }) => {
    await complaints.respondToComplaint(input.id, ctx.user.id, input.statement);
    return { success: true };
  }),
  addEvidence: protectedProcedure.input(z.object({ complaintId: z.number().int().positive(), description: z.string().trim().min(2).max(1000) })).mutation(async ({ ctx, input }) => ({
    id: await complaints.addComplaintEvidenceRecord(input.complaintId, ctx.user.id, input.description),
  })),
});

export const adminComplaintsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.complaint.read", view: "list", requestId: requestId(ctx) });
    const rows = await complaints.listComplaintsForAdmin();
    const service = getAuthorizationService();
    const resolved = await Promise.all(rows.map(async (row) => ({ row, decision: await service.authorize({
      accountId: ctx.user.id, capabilityCode: "platform.complaint.read", platformStaffPositionId: authorization.resolvedPlatformStaffPositionId,
      resourceType: "complaint", resourceId: String(row.id), view: "list", requestId: requestId(ctx),
    }) })));
    return resolved.filter(({ decision }) => decision.allowed).map(({ row, decision }) => serializeAuthorized(row, decision));
  }),
  detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, {
      capabilityCode: "platform.complaint.read", resourceType: "complaint", resourceId: String(input.id), view: "detail",
      requestedFields: ["description", "expectedResolution", "respondentStatement", "resolution", "fileName", "storageKey", "publicUrl"], requestId: requestId(ctx),
    });
    const detail = await complaints.complaintDetail(input.id, ctx.user.id, true);
    return {
      ...detail,
      complaint: serializeAuthorized(detail.complaint, authorization),
      evidence: detail.evidence.map((item) => serializeAuthorized(item, authorization)),
    };
  }),
  requestEvidence: protectedProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(2).max(500) })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.complaint.investigate", resourceType: "complaint", resourceId: String(input.id), requestId: requestId(ctx), purpose: "request_evidence" });
    const status = await complaints.transitionComplaint(input.id, ctx.user.id, "request_evidence", input.note);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "complaint.request_evidence", resourceType: "complaint", resourceId: input.id, detail: { note: input.note }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    return { status };
  }),
  negotiate: protectedProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(2).max(500) })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.complaint.investigate", resourceType: "complaint", resourceId: String(input.id), requestId: requestId(ctx), purpose: "negotiate_complaint" });
    const status = await complaints.transitionComplaint(input.id, ctx.user.id, "negotiate", input.note);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "complaint.negotiate", resourceType: "complaint", resourceId: input.id, detail: { note: input.note }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    return { status };
  }),
  decide: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    result: z.enum(["dismiss", "continue_performance", "redeliver", "full_refund", "partial_refund", "release_all", "partial_release"]),
    reason: z.string().trim().min(5).max(2000), refundAmount: z.union([z.string(), z.number()]).optional(),
    releaseAmount: z.union([z.string(), z.number()]).optional(),
    continuePerformance: z.boolean().optional(),
    creditPenalty: z.enum(["warning", "credit_deduction", "restrict_orders", "suspend_account"]).optional(),
    scoreChange: z.number().int().min(-100).max(-1).optional(), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.complaint.decide", resourceType: "complaint", resourceId: String(input.id), requestId: requestId(ctx), purpose: "decide_complaint" });
    if (input.confirmation !== `CONFIRM:complaint:${input.id}`) throw new Error("高风险操作二次确认无效");
    const result = await complaints.decideComplaint({ complaintId: input.id, operatorId: ctx.user.id, result: input.result, reason: input.reason, refundAmount: input.refundAmount, releaseAmount: input.releaseAmount, continuePerformance: input.continuePerformance, creditPenalty: input.creditPenalty, scoreChange: input.scoreChange });
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "complaint.decide", resourceType: "complaint", resourceId: input.id, riskLevel: "high", detail: { result: input.result, refundAmount: input.refundAmount, releaseAmount: input.releaseAmount, creditPenalty: input.creditPenalty }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    return result;
  }),
  close: protectedProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(2).max(500), confirmation: z.string() })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.complaint.investigate", resourceType: "complaint", resourceId: String(input.id), requestId: requestId(ctx), purpose: "close_complaint" });
    if (input.confirmation !== `CONFIRM:complaint-close:${input.id}`) throw new Error("高风险操作二次确认无效");
    const status = await complaints.transitionComplaint(input.id, ctx.user.id, "close", input.note);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "complaint.close", resourceType: "complaint", resourceId: input.id, riskLevel: "high", ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    return { status };
  }),
});
