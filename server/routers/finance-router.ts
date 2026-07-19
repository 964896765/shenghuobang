import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { assertHighRiskConfirmation } from "../domain/finance-policy";
import * as finance from "../services/finance-service";
import { writeAudit } from "../services/audit-service";
import * as db from "../db";
import { authorizeOrThrow, getAuthorizationService, serializeAuthorized } from "../authorization";

const moneySchema = z.union([
  z.string().regex(/^(?:0\.(?:0[1-9]|[1-9]\d)|[1-9]\d*(?:\.\d{1,2})?)$/),
  z.number().positive(),
]);
const idempotencySchema = z.string().trim().min(8).max(128);

function auditRequest(ctx: { req: { ip?: string; headers: Record<string, string | string[] | undefined> } }) {
  const userAgent = ctx.req.headers["user-agent"];
  return { ipAddress: ctx.req.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}

export const paymentsRouter = router({
  create: protectedProcedure.input(z.object({
    orderId: z.number().int().positive(), amount: moneySchema, idempotencyKey: idempotencySchema,
  })).mutation(async ({ ctx, input }) => {
    const payment = await finance.createPayment({ ...input, payerId: ctx.user.id });
    return { payment, sandboxNotice: "沙箱支付，仅用于开发测试，不产生真实资金交易。" };
  }),
  confirmSandbox: protectedProcedure.input(z.object({
    paymentId: z.number().int().positive(), idempotencyKey: idempotencySchema,
  })).mutation(async ({ ctx, input }) => {
    const result = await finance.confirmPayment({ ...input, payerId: ctx.user.id });
    if (!result.alreadyConfirmed) {
      const financeDetail = await finance.getPaymentForUser(input.paymentId, ctx.user.id);
      await db.createNotification({ userId: financeDetail.order.sellerId, category: "order", title: "买家已完成沙箱支付", content: `订单「${financeDetail.order.title}」款项已进入托管。`, refType: "order", refId: financeDetail.order.id });
    }
    return { ...result, sandboxNotice: "沙箱支付，仅用于开发测试，不产生真实资金交易。" };
  }),
  result: protectedProcedure.input(z.object({ paymentId: z.number().int().positive() })).query(({ ctx, input }) =>
    finance.getPaymentForUser(input.paymentId, ctx.user.id)),
  byOrder: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).query(({ ctx, input }) =>
    finance.getPaymentByOrderForUser(input.orderId, ctx.user.id)),
});

export const refundsRouter = router({
  mine: protectedProcedure.query(({ ctx }) => finance.listRefundsForUser(ctx.user.id)),
  submit: protectedProcedure.input(z.object({
    paymentId: z.number().int().positive(), amount: moneySchema, reason: z.string().trim().min(5).max(2000),
    idempotencyKey: idempotencySchema,
  })).mutation(({ ctx, input }) => finance.submitRefund({ ...input, requesterId: ctx.user.id })),
});

export const escrowRouter = router({
  project: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(({ ctx, input }) =>
    finance.getProjectFinance(input.projectId, ctx.user.id)),
});

export const settlementsRouter = router({
  detail: protectedProcedure.input(z.object({ settlementId: z.number().int().positive() })).query(({ ctx, input }) =>
    finance.settlementDetailForMember(input.settlementId, ctx.user.id)),
});

export const adminFinanceRouter = router({
  refunds: protectedProcedure.query(async ({ ctx }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.finance.read", view: "list", requestedFields: ["bankAccount", "settlementAccount"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const rows = await finance.listRefundsForAdmin();
    const service = getAuthorizationService();
    const resolved = await Promise.all(rows.map(async (row) => ({ row, decision: await service.authorize({
      accountId: ctx.user.id, capabilityCode: "platform.finance.read", platformStaffPositionId: authorization.resolvedPlatformStaffPositionId,
      resourceType: "refund", resourceId: String(row.id), view: "list", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null,
    }) })));
    return resolved.filter(({ decision }) => decision.allowed).map(({ row, decision }) => serializeAuthorized(row, decision));
  }),
  settlements: protectedProcedure.query(async ({ ctx }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.finance.read", view: "list", requestedFields: ["bankAccount", "settlementAccount"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const rows = await finance.listSettlementsForAdmin();
    const service = getAuthorizationService();
    const resolved = await Promise.all(rows.map(async (row) => ({ row, decision: await service.authorize({
      accountId: ctx.user.id, capabilityCode: "platform.finance.read", platformStaffPositionId: authorization.resolvedPlatformStaffPositionId,
      resourceType: "settlement", resourceId: String(row.id), view: "list", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null,
    }) })));
    return resolved.filter(({ decision }) => decision.allowed).map(({ row, decision }) => serializeAuthorized(row, decision));
  }),
  approveRefund: protectedProcedure.input(z.object({
    refundId: z.number().int().positive(), reviewReason: z.string().trim().min(2).max(500), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.finance.review", resourceType: "refund", resourceId: String(input.refundId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "approve_refund" });
    assertHighRiskConfirmation(input.confirmation, `refund:${input.refundId}`);
    const result = await finance.approveRefund(input.refundId, ctx.user.id, input.reviewReason);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "refund.approve", resourceType: "refund", resourceId: input.refundId, riskLevel: "high", detail: { reviewReason: input.reviewReason }, ...auditRequest(ctx) });
    return result;
  }),
  rejectRefund: protectedProcedure.input(z.object({
    refundId: z.number().int().positive(), reviewReason: z.string().trim().min(2).max(500), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.finance.review", resourceType: "refund", resourceId: String(input.refundId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "reject_refund" });
    assertHighRiskConfirmation(input.confirmation, `refund-reject:${input.refundId}`);
    const result = await finance.rejectRefund(input.refundId, ctx.user.id, input.reviewReason);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "refund.reject", resourceType: "refund", resourceId: input.refundId, riskLevel: "high", detail: { reviewReason: input.reviewReason }, ...auditRequest(ctx) });
    await db.createNotification({ userId: result.requesterId, category: "order", title: "退款申请未通过", content: input.reviewReason, refType: "order", refId: result.orderId });
    return result;
  }),
  executeRefund: protectedProcedure.input(z.object({
    refundId: z.number().int().positive(), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.funds.execute", resourceType: "refund", resourceId: String(input.refundId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "execute_refund" });
    assertHighRiskConfirmation(input.confirmation, `refund-execute:${input.refundId}`);
    const result = await finance.executeApprovedRefund(input.refundId, ctx.user.id);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "refund.execute", resourceType: "refund", resourceId: input.refundId, riskLevel: "high", ...auditRequest(ctx) });
    await db.createNotification({ userId: result.refund.requesterId, category: "order", title: "退款已执行", content: `退款 ¥${result.refund.amount} 已通过沙箱渠道完成。`, refType: "order", refId: result.refund.orderId });
    return result;
  }),
  retryRefund: protectedProcedure.input(z.object({
    refundId: z.number().int().positive(), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.funds.execute", resourceType: "refund", resourceId: String(input.refundId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "retry_refund" });
    assertHighRiskConfirmation(input.confirmation, `refund-retry:${input.refundId}`);
    const result = await finance.retryFailedRefund(input.refundId, ctx.user.id);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "refund.retry", resourceType: "refund", resourceId: input.refundId, riskLevel: "high", ...auditRequest(ctx) });
    return result;
  }),
  approveSettlement: protectedProcedure.input(z.object({ settlementId: z.number().int().positive(), confirmation: z.string() })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.finance.review", resourceType: "settlement", resourceId: String(input.settlementId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "approve_settlement" });
    assertHighRiskConfirmation(input.confirmation, `settlement:${input.settlementId}`);
    const result = await finance.approveSettlement(input.settlementId, ctx.user.id);
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "settlement.approve", resourceType: "settlement", resourceId: input.settlementId, riskLevel: "high", ...auditRequest(ctx) });
    return result;
  }),
  releaseSettlement: protectedProcedure.input(z.object({
    settlementId: z.number().int().positive(), idempotencyKey: idempotencySchema, confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.funds.execute", resourceType: "settlement", resourceId: String(input.settlementId), requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null, purpose: "release_settlement" });
    assertHighRiskConfirmation(input.confirmation, `settlement-release:${input.settlementId}`);
    const result = await finance.releaseSettlement({ settlementId: input.settlementId, operatorId: ctx.user.id, idempotencyKey: input.idempotencyKey });
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "escrow.release", resourceType: "settlement", resourceId: input.settlementId, riskLevel: "high", ...auditRequest(ctx) });
    return result;
  }),
});
