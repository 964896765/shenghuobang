import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDb, createNotification, getUserById, listFileAccessLogs, listNotificationFailures } from "../db";
import { getAuditLog, listAuditLogs, writeAudit } from "../services/audit-service";
import { authorizeOrThrow, getAuthorizationService, serializeAuthorized } from "../authorization";

const ADMIN_MENU_CAPABILITIES = [
  "platform.certification.queue_read", "platform.certification.document_read", "platform.certification.review_initial", "platform.certification.review_final",
  "platform.complaint.read", "platform.complaint.investigate", "platform.complaint.decide", "platform.finance.read", "platform.finance.review",
  "platform.funds.execute", "platform.audit.read", "platform.permission.manage",
] as const;

export const adminRouter = router({
  menu: protectedProcedure.query(async ({ ctx }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.workspace.access", purpose: "admin_menu", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const service = getAuthorizationService();
    const resolved = await Promise.all(ADMIN_MENU_CAPABILITIES.map(async (capabilityCode) => ({
      capabilityCode,
      allowed: (await service.authorize({ accountId: ctx.user.id, capabilityCode, purpose: "admin_menu_capability" })).allowed,
    })));
    const capabilities = resolved.filter((item) => item.allowed).map((item) => item.capabilityCode);
    const permissions: string[] = [];
    if (capabilities.includes("platform.certification.queue_read")) permissions.push("verification.read");
    if (capabilities.includes("platform.complaint.read")) permissions.push("complaint.read");
    if (capabilities.includes("platform.finance.read")) permissions.push("finance.read");
    if (capabilities.includes("platform.audit.read")) permissions.push("audit.read");
    return { role: ctx.user.role, capabilities, permissions };
  }),
  changeRole: protectedProcedure.input(z.object({
    userId: z.number().int().positive(),
    role: z.enum(["user", "admin", "verification_reviewer", "complaint_operator", "finance_operator", "customer_service"]),
    reason: z.string().trim().min(5).max(500), confirmation: z.string(),
  })).mutation(async ({ ctx, input }) => {
    await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.permission.manage", purpose: "change_legacy_role", requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    if (input.confirmation !== `CONFIRM:admin-role:${input.userId}`) throw new Error("高风险操作二次确认无效");
    if (input.userId === ctx.user.id && input.role === "user") throw new Error("不能移除自己的管理员权限");
    const target = await getUserById(input.userId);
    if (!target) throw new Error("用户不存在");
    const db = await requireDb();
    await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
    await writeAudit({ actorId: ctx.user.id, actorRole: ctx.user.role, action: "admin.role.change", resourceType: "user", resourceId: input.userId, riskLevel: "high", detail: { fromRole: target.role, toRole: input.role, reason: input.reason }, ipAddress: ctx.req.ip, userAgent: ctx.req.get("user-agent") });
    await createNotification({ userId: input.userId, category: "system", title: "账号权限已变更", content: input.reason });
    return { success: true };
  }),
});

export const auditLogsRouter = router({
  list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.audit.read", view: "list", requestedFields: ["ipAddress", "userAgent", "contextData"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const rows = await listAuditLogs(input?.limit ?? 100);
    return rows.map((row) => serializeAuthorized(row, authorization));
  }),
  detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.audit.read", view: "detail", requestedFields: ["ipAddress", "userAgent", "contextData"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const log = await getAuditLog(input.id);
    if (!log) throw new Error("审计日志不存在");
    return serializeAuthorized(log, authorization);
  }),
});

export const platformOperationsRouter = router({
  fileAccess: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.audit.read", view: "list", requestedFields: ["fileName", "storageKey", "publicUrl", "ipAddress"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const rows = await listFileAccessLogs(input?.limit ?? 100);
    return rows.map((row) => serializeAuthorized(row, authorization));
  }),
  notificationFailures: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(async ({ ctx, input }) => {
    const authorization = await authorizeOrThrow(ctx.user.id, { capabilityCode: "platform.audit.read", view: "list", requestedFields: ["phone", "email", "token"], requestId: String(ctx.req.headers["x-request-id"] ?? "").slice(0, 64) || null });
    const rows = await listNotificationFailures(input?.limit ?? 100);
    return rows.map((row) => serializeAuthorized(row, authorization));
  }),
});
