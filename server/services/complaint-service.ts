import crypto from "node:crypto";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  complaintActions,
  complaintActiveLocks,
  complaintBusinessSnapshots,
  complaintCreditActions,
  complaintDecisions,
  complaintEvidence,
  complaintFundActions,
  complaints,
  complaintStatusLogs,
  creditEvents,
  escrowRecords,
  escrowReleases,
  milestones,
  paymentEvents,
  payments,
  projects,
  refunds,
  settlements,
  userProfiles,
  users,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import { addMoney, assertPositiveMoney, assertWholeYuan, centsToMoney, moneyToCents, normalizeMoney, subtractMoney } from "../domain/money";
import type { PaymentProvider } from "../payments/provider";
import { executeApprovedRefund } from "./finance-service";

export type ComplaintDecisionResult =
  | "dismiss" | "continue_performance" | "redeliver" | "full_refund" | "partial_refund" | "release_all" | "partial_release";
export type CreditPenalty = "warning" | "credit_deduction" | "restrict_orders" | "suspend_account";

type ProjectStatus = typeof projects.$inferSelect["status"];
type MilestoneStatus = typeof milestones.$inferSelect["status"];
type SettlementStatus = typeof settlements.$inferSelect["status"];
type EscrowStatus = typeof escrowRecords.$inferSelect["status"];

const ACTIVE_COMPLAINT_STATUSES: (typeof complaints.$inferSelect["status"])[] = [
  "submitted", "waiting_response", "under_review", "waiting_evidence", "negotiating", "decision_pending",
];
const PROJECT_STATUSES: ProjectStatus[] = ["pending_confirmation", "pending_agreement", "pending_payment", "in_progress", "waiting_acceptance", "revision", "paused", "disputed", "completed", "cancelled", "refunded", "closed"];
const MILESTONE_STATUSES: MilestoneStatus[] = ["pending", "in_progress", "submitted", "waiting_acceptance", "revision_required", "accepted", "overdue", "disputed", "cancelled"];
const SETTLEMENT_STATUSES: SettlementStatus[] = ["pending", "under_review", "approved", "processing", "settled", "rejected", "frozen"];
const ESCROW_STATUSES: EscrowStatus[] = ["pending", "funded", "partially_released", "released", "frozen", "partially_refunded", "refunded", "closed"];

function businessNo(prefix: string) {
  return `${prefix}${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function checkedStatus<T extends string>(value: string, valid: readonly T[], label: string): T {
  if (!valid.includes(value as T)) throw new Error(`${label}快照状态无效：${value}`);
  return value as T;
}

async function loadProjectAndMilestone(
  tx: Pick<Awaited<ReturnType<typeof requireDb>>, "select">,
  relatedType: string,
  relatedId: number,
) {
  if (relatedType === "project") {
    const project = (await tx.select().from(projects).where(eq(projects.id, relatedId)).limit(1))[0];
    return { project, milestone: undefined };
  }
  if (relatedType === "milestone") {
    const milestone = (await tx.select().from(milestones).where(eq(milestones.id, relatedId)).limit(1))[0];
    const project = milestone ? (await tx.select().from(projects).where(eq(projects.id, milestone.projectId)).limit(1))[0] : undefined;
    return { project, milestone };
  }
  return { project: undefined, milestone: undefined };
}

export async function createComplaintAndFreeze(input: {
  complainantId: number; relatedType: "project" | "milestone"; relatedId: number;
  complaintType: string; description: string; expectedResolution?: string;
}) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    let milestone = input.relatedType === "milestone"
      ? (await tx.select().from(milestones).where(eq(milestones.id, input.relatedId)).for("update").limit(1))[0]
      : undefined;
    const projectId = input.relatedType === "project" ? input.relatedId : milestone?.projectId;
    if (!projectId) throw new Error("关联项目不存在");
    const project = (await tx.select().from(projects).where(eq(projects.id, projectId)).for("update").limit(1))[0];
    if (!project) throw new Error("关联项目不存在");
    if (project.ownerId !== input.complainantId && project.engineerId !== input.complainantId) throw new Error("你不是该项目成员");

    const existingLock = await tx.select().from(complaintActiveLocks).where(eq(complaintActiveLocks.projectId, project.id)).for("update").limit(1);
    if (existingLock[0]) throw new Error("该项目已有活动投诉，不能重复创建");
    const projectMilestones = await tx.select({ id: milestones.id }).from(milestones).where(eq(milestones.projectId, project.id));
    const milestoneIds = projectMilestones.map((item) => item.id);
    const relationCondition = milestoneIds.length > 0
      ? or(
          and(eq(complaints.relatedType, "project"), eq(complaints.relatedId, project.id)),
          and(eq(complaints.relatedType, "milestone"), inArray(complaints.relatedId, milestoneIds)),
        )
      : and(eq(complaints.relatedType, "project"), eq(complaints.relatedId, project.id));
    const legacyActive = await tx.select({ id: complaints.id }).from(complaints).where(and(relationCondition, inArray(complaints.status, ACTIVE_COMPLAINT_STATUSES))).limit(1);
    if (legacyActive[0]) throw new Error("该项目已有活动投诉，不能重复创建");

    const respondentId = project.ownerId === input.complainantId ? project.engineerId : project.ownerId;
    const result = await tx.insert(complaints).values({
      complainantId: input.complainantId, respondentId, relatedType: input.relatedType, relatedId: input.relatedId,
      complaintType: input.complaintType, description: input.description, expectedResolution: input.expectedResolution,
      status: "waiting_response",
    });
    const complaintId = Number(result[0].insertId);

    const escrows = await tx.select().from(escrowRecords).where(eq(escrowRecords.projectId, project.id)).for("update");
    const settlementRows = await tx.select().from(settlements).where(eq(settlements.projectId, project.id)).for("update");
    await tx.insert(complaintBusinessSnapshots).values({
      complaintId,
      projectId: project.id,
      projectPreviousStatus: project.status,
      milestoneId: milestone?.id,
      milestonePreviousStatus: milestone?.status,
      escrowStates: escrows.map((item) => ({ id: item.id, status: item.status })),
      settlementStates: settlementRows.map((item) => ({ id: item.id, status: item.status })),
    });
    await tx.insert(complaintActiveLocks).values({ complaintId, projectId: project.id, milestoneId: milestone?.id });

    await tx.update(projects).set({ status: "disputed" }).where(eq(projects.id, project.id));
    if (milestone) await tx.update(milestones).set({ status: "disputed" }).where(eq(milestones.id, milestone.id));
    await tx.insert(complaintStatusLogs).values({ complaintId, fromStatus: null, toStatus: "waiting_response", actorId: input.complainantId, note: "用户提交投诉" });
    await tx.insert(complaintActions).values({ complaintId, actorId: input.complainantId, actorType: "user", action: "submit", detail: input.description });

    for (const escrow of escrows) {
      if (!["released", "refunded", "closed"].includes(escrow.status)) {
        await tx.update(escrowRecords).set({ status: "frozen", frozenReason: `投诉 #${complaintId}` }).where(eq(escrowRecords.id, escrow.id));
        await tx.insert(complaintFundActions).values({ complaintId, escrowId: escrow.id, action: "freeze", status: "success" });
        await tx.insert(paymentEvents).values({ paymentId: escrow.paymentId, eventType: "escrow_frozen_by_complaint", detail: { complaintId, escrowId: escrow.id } });
      }
    }
    for (const settlement of settlementRows) {
      if (["pending", "under_review", "approved", "processing"].includes(settlement.status)) {
        await tx.update(settlements).set({ status: "frozen", frozenReason: `投诉 #${complaintId}` }).where(eq(settlements.id, settlement.id));
        await tx.insert(complaintFundActions).values({ complaintId, settlementId: settlement.id, action: "freeze", status: "success" });
      }
    }
    return { complaintId, respondentId, projectId: project.id };
  });
}

export async function respondToComplaint(complaintId: number, userId: number, statement: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const item = (await tx.select().from(complaints).where(eq(complaints.id, complaintId)).for("update").limit(1))[0];
    if (!item) throw new Error("投诉不存在");
    if (item.respondentId !== userId) throw new Error("只有被投诉方可以回应");
    if (!["submitted", "waiting_response", "under_review", "waiting_evidence"].includes(item.status)) throw new Error("当前状态不能回应");
    await tx.update(complaints).set({ respondentStatement: statement, status: "under_review" }).where(eq(complaints.id, complaintId));
    await tx.insert(complaintActions).values({ complaintId, actorId: userId, actorType: "user", action: "respond", detail: statement });
    await tx.insert(complaintStatusLogs).values({ complaintId, fromStatus: item.status, toStatus: "under_review", actorId: userId, note: "被投诉方提交回应" });
  });
}

export async function addComplaintEvidenceRecord(complaintId: number, userId: number, description: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const item = (await tx.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1))[0];
    if (!item || (item.complainantId !== userId && item.respondentId !== userId)) throw new Error("无权提交证据");
    if (["resolved", "rejected", "withdrawn", "closed"].includes(item.status)) throw new Error("案件已结束，不能继续补证");
    const result = await tx.insert(complaintEvidence).values({ complaintId, submitterId: userId, description });
    await tx.insert(complaintActions).values({ complaintId, actorId: userId, actorType: "user", action: "add_evidence", detail: description });
    return Number(result[0].insertId);
  });
}

export async function listComplaintsForAdmin() {
  const db = await requireDb();
  return db.select().from(complaints).orderBy(desc(complaints.createdAt)).limit(200);
}

export async function complaintDetail(complaintId: number, viewerId: number, admin = false) {
  const db = await requireDb();
  const complaint = (await db.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1))[0];
  if (!complaint) throw new Error("投诉不存在");
  if (!admin && complaint.complainantId !== viewerId && complaint.respondentId !== viewerId) throw new Error("无权查看该投诉");
  const [evidence, actions, timeline, decisions, fundActions, creditActions, snapshots] = await Promise.all([
    db.select().from(complaintEvidence).where(eq(complaintEvidence.complaintId, complaintId)).orderBy(desc(complaintEvidence.createdAt)),
    db.select().from(complaintActions).where(eq(complaintActions.complaintId, complaintId)).orderBy(complaintActions.createdAt),
    db.select().from(complaintStatusLogs).where(eq(complaintStatusLogs.complaintId, complaintId)).orderBy(complaintStatusLogs.createdAt),
    db.select().from(complaintDecisions).where(eq(complaintDecisions.complaintId, complaintId)),
    db.select().from(complaintFundActions).where(eq(complaintFundActions.complaintId, complaintId)),
    db.select().from(complaintCreditActions).where(eq(complaintCreditActions.complaintId, complaintId)),
    db.select().from(complaintBusinessSnapshots).where(eq(complaintBusinessSnapshots.complaintId, complaintId)).limit(1),
  ]);
  return { complaint, evidence, actions, timeline, decision: decisions[0] ?? null, fundActions, creditActions, businessSnapshot: snapshots[0] ?? null };
}

export async function transitionComplaint(complaintId: number, operatorId: number, action: "request_evidence" | "negotiate" | "close", note: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const item = (await tx.select().from(complaints).where(eq(complaints.id, complaintId)).for("update").limit(1))[0];
    if (!item) throw new Error("投诉不存在");
    const toStatus = action === "request_evidence" ? "waiting_evidence" : action === "negotiate" ? "negotiating" : "closed";
    if (action === "close" && !["resolved", "rejected"].includes(item.status)) throw new Error("只有已裁定案件可以关闭");
    if (action !== "close" && ["resolved", "rejected", "withdrawn", "closed"].includes(item.status)) throw new Error("案件已结束");
    await tx.update(complaints).set({ status: toStatus }).where(eq(complaints.id, complaintId));
    await tx.insert(complaintStatusLogs).values({ complaintId, fromStatus: item.status, toStatus, actorId: operatorId, note });
    await tx.insert(complaintActions).values({ complaintId, actorId: operatorId, actorType: "admin", action, detail: note });
    return toStatus;
  });
}

export async function decideComplaint(input: {
  complaintId: number; operatorId: number; result: ComplaintDecisionResult; reason: string;
  refundAmount?: string | number; releaseAmount?: string | number; continuePerformance?: boolean;
  creditPenalty?: CreditPenalty; scoreChange?: number;
  paymentProvider?: PaymentProvider;
}) {
  if (input.result === "partial_refund" && input.continuePerformance === undefined) {
    throw new Error("部分退款裁定必须明确是否继续履约");
  }
  if (input.refundAmount !== undefined) {
    assertWholeYuan(input.refundAmount);
    assertPositiveMoney(input.refundAmount, "退款金额必须大于 0");
  }
  if (input.releaseAmount !== undefined) {
    assertWholeYuan(input.releaseAmount);
    assertPositiveMoney(input.releaseAmount, "托管释放金额必须大于 0");
  }
  const db = await requireDb();

  const prepared = await db.transaction(async (tx) => {
    const complaint = (await tx.select().from(complaints).where(eq(complaints.id, input.complaintId)).for("update").limit(1))[0];
    if (!complaint) throw new Error("投诉不存在");
    if (["resolved", "rejected", "withdrawn", "closed"].includes(complaint.status)) {
      const decision = (await tx.select().from(complaintDecisions).where(eq(complaintDecisions.complaintId, complaint.id)).limit(1))[0];
      return { kind: "already" as const, decisionId: decision?.id ?? 0, finalStatus: complaint.status };
    }
    const { project } = await loadProjectAndMilestone(tx, complaint.relatedType, complaint.relatedId);
    if (!project) throw new Error("关联项目不存在");
    const activeLock = (await tx.select().from(complaintActiveLocks).where(eq(complaintActiveLocks.complaintId, complaint.id)).for("update").limit(1))[0];
    if (!activeLock) throw new Error("活动投诉锁不存在，禁止解冻资金");
    const escrows = await tx.select().from(escrowRecords).where(eq(escrowRecords.projectId, project.id)).orderBy(escrowRecords.id).for("update");
    if (["full_refund", "partial_refund", "release_all", "partial_release"].includes(input.result) && escrows.length === 0) throw new Error("案件没有可处理的托管资金");

    if (input.result === "full_refund" || input.result === "partial_refund") {
      const refundRows: (typeof refunds.$inferSelect)[] = [];
      const existingByEscrow = new Map<number, typeof refunds.$inferSelect>();
      for (const [index, escrow] of escrows.entries()) {
        const keys = [`complaint:${complaint.id}:refund:${escrow.id}`];
        if (index === 0) keys.push(`complaint:${complaint.id}:refund`);
        const existing = (await tx.select().from(refunds).where(and(
          eq(refunds.paymentId, escrow.paymentId),
          inArray(refunds.idempotencyKey, keys),
        )).limit(1))[0];
        if (existing) {
          existingByEscrow.set(escrow.id, existing);
          refundRows.push(existing);
        }
      }

      let remainingCents = input.result === "partial_refund"
        ? moneyToCents(normalizeMoney(input.refundAmount ?? "0")) - refundRows.reduce((sum, refund) => sum + moneyToCents(refund.amount), 0n)
        : 0n;
      if (input.result === "partial_refund" && remainingCents < 0n) throw new Error("裁定退款金额与既有重试记录不一致");

      for (const escrow of escrows) {
        if (existingByEscrow.has(escrow.id)) continue;
        const availableCents = moneyToCents(subtractMoney(escrow.totalAmount, addMoney(escrow.refundedAmount, escrow.releasedAmount)));
        const amountCents = input.result === "full_refund" ? availableCents : (remainingCents < availableCents ? remainingCents : availableCents);
        if (amountCents <= 0n) continue;
        const payment = (await tx.select().from(payments).where(eq(payments.id, escrow.paymentId)).for("update").limit(1))[0];
        if (!payment?.providerTransactionNo) throw new Error("原支付交易不可退款");
        const amount = centsToMoney(amountCents);
        const idempotencyKey = `complaint:${complaint.id}:refund:${escrow.id}`;
        const result = await tx.insert(refunds).values({
          refundNo: businessNo("REF"), paymentId: payment.id, orderId: escrow.orderId, requesterId: complaint.complainantId,
          amount, reason: `投诉 #${complaint.id} 平台裁定`, status: "approved", idempotencyKey,
          reviewedBy: input.operatorId, reviewReason: input.reason, reviewedAt: new Date(),
        });
        const created = (await tx.select().from(refunds).where(eq(refunds.id, Number(result[0].insertId))).limit(1))[0];
        if (!created) throw new Error("无法创建裁定退款");
        refundRows.push(created);
        if (input.result === "partial_refund") remainingCents -= amountCents;
      }
      if (input.result === "partial_refund" && remainingCents !== 0n) throw new Error("裁定退款金额超过全部托管可退款金额");
      if (refundRows.length === 0) throw new Error("案件没有正数可退款金额");
      await tx.update(complaints).set({ status: "decision_pending" }).where(eq(complaints.id, complaint.id));
      return { kind: "refund" as const, refundIds: refundRows.map((refund) => refund.id) };
    }
    await tx.update(complaints).set({ status: "decision_pending" }).where(eq(complaints.id, complaint.id));
    return { kind: "finalize" as const };
  });

  if (prepared.kind === "already") return { decisionId: prepared.decisionId, finalStatus: prepared.finalStatus };
  if (prepared.kind === "refund") {
    try {
      for (const refundId of prepared.refundIds) await executeApprovedRefund(refundId, input.operatorId, input.paymentProvider);
    } catch (error) {
      await db.transaction(async (tx) => {
        const complaint = (await tx.select().from(complaints).where(eq(complaints.id, input.complaintId)).for("update").limit(1))[0];
        if (complaint?.status === "decision_pending") {
          await tx.update(complaints).set({ status: "under_review" }).where(eq(complaints.id, complaint.id));
          await tx.insert(complaintActions).values({ complaintId: complaint.id, actorId: input.operatorId, actorType: "admin", action: "decision_refund_failed", detail: error instanceof Error ? error.message : "裁定退款失败" });
        }
      });
      throw error;
    }
  }

  return db.transaction(async (tx) => {
    const complaint = (await tx.select().from(complaints).where(eq(complaints.id, input.complaintId)).for("update").limit(1))[0];
    if (!complaint) throw new Error("投诉不存在");
    if (["resolved", "rejected", "closed"].includes(complaint.status)) {
      const decision = (await tx.select().from(complaintDecisions).where(eq(complaintDecisions.complaintId, complaint.id)).limit(1))[0];
      return { decisionId: decision?.id ?? 0, finalStatus: complaint.status };
    }
    if (complaint.status !== "decision_pending") throw new Error("投诉裁定状态已变化");
    const { project, milestone } = await loadProjectAndMilestone(tx, complaint.relatedType, complaint.relatedId);
    if (!project) throw new Error("关联项目不存在");
    await tx.select().from(projects).where(eq(projects.id, project.id)).for("update").limit(1);
    const snapshot = (await tx.select().from(complaintBusinessSnapshots).where(eq(complaintBusinessSnapshots.complaintId, complaint.id)).for("update").limit(1))[0];
    if (!snapshot) throw new Error("投诉业务快照不存在");
    const currentLock = (await tx.select().from(complaintActiveLocks).where(eq(complaintActiveLocks.complaintId, complaint.id)).for("update").limit(1))[0];
    if (!currentLock) throw new Error("活动投诉锁不存在，禁止解冻资金");
    const otherActive = await tx.select().from(complaintActiveLocks).where(and(eq(complaintActiveLocks.projectId, project.id), ne(complaintActiveLocks.complaintId, complaint.id))).for("update").limit(1);
    if (otherActive[0]) throw new Error("项目仍有其他活动投诉，禁止解冻资金");

    const escrows = await tx.select().from(escrowRecords).where(eq(escrowRecords.projectId, project.id)).orderBy(escrowRecords.id).for("update");
    const frozenSettlements = await tx.select().from(settlements).where(and(eq(settlements.projectId, project.id), eq(settlements.status, "frozen"))).for("update");
    const settlementSnapshot = new Map(snapshot.settlementStates.map((item) => [item.id, checkedStatus(item.status, SETTLEMENT_STATUSES, "结算")]));
    const escrowSnapshot = new Map(snapshot.escrowStates.map((item) => [item.id, checkedStatus(item.status, ESCROW_STATUSES, "托管")]));
    let refundAmount: string | null = null;
    let releaseAmount: string | null = null;

    const milestoneSnapshotStatus = snapshot.milestonePreviousStatus
      ? checkedStatus(snapshot.milestonePreviousStatus, MILESTONE_STATUSES, "里程碑")
      : undefined;
    const continuingMilestoneStatus: MilestoneStatus = milestoneSnapshotStatus && !["disputed", "cancelled"].includes(milestoneSnapshotStatus)
      ? milestoneSnapshotStatus
      : "revision_required";

    const restoreSettlements = async () => {
      for (const settlement of frozenSettlements) {
        await tx.update(settlements).set({ status: settlementSnapshot.get(settlement.id) ?? "pending", frozenReason: null }).where(eq(settlements.id, settlement.id));
      }
    };
    const setFrozenSettlements = async (status: SettlementStatus, settled = false) => {
      for (const settlement of frozenSettlements) {
        await tx.update(settlements).set({ status, frozenReason: null, settledAt: settled ? new Date() : settlement.settledAt }).where(eq(settlements.id, settlement.id));
      }
    };
    const computedEscrowStatus = (escrow: typeof escrowRecords.$inferSelect): EscrowStatus => {
      const total = moneyToCents(escrow.totalAmount);
      const refunded = moneyToCents(escrow.refundedAmount);
      const released = moneyToCents(escrow.releasedAmount);
      if (refunded + released === total) {
        if (refunded === total) return "refunded";
        if (released === total) return "released";
        return "closed";
      }
      if (refunded > 0n) return "partially_refunded";
      if (released > 0n) return "partially_released";
      const previous = escrowSnapshot.get(escrow.id);
      return previous && previous !== "frozen" ? previous : "funded";
    };
    const clearFrozenEscrows = async (restoreSnapshot: boolean, skipIds = new Set<number>()) => {
      for (const escrow of escrows) {
        if (skipIds.has(escrow.id)) continue;
        if (escrow.status !== "frozen") continue;
        const snapshotStatus = escrowSnapshot.get(escrow.id);
        const status = restoreSnapshot && snapshotStatus && snapshotStatus !== "frozen" ? snapshotStatus : computedEscrowStatus(escrow);
        await tx.update(escrowRecords).set({ status, frozenReason: null }).where(eq(escrowRecords.id, escrow.id));
        await tx.insert(complaintFundActions).values({ complaintId: complaint.id, escrowId: escrow.id, action: "unfreeze", status: "success" });
      }
    };

    if (input.result === "dismiss") {
      await tx.update(projects).set({ status: checkedStatus(snapshot.projectPreviousStatus, PROJECT_STATUSES, "项目") }).where(eq(projects.id, project.id));
      if (snapshot.milestoneId && snapshot.milestonePreviousStatus) await tx.update(milestones).set({ status: checkedStatus(snapshot.milestonePreviousStatus, MILESTONE_STATUSES, "里程碑") }).where(eq(milestones.id, snapshot.milestoneId));
      await restoreSettlements();
    } else if (input.result === "continue_performance") {
      await tx.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
      if (snapshot.milestoneId) await tx.update(milestones).set({ status: continuingMilestoneStatus }).where(eq(milestones.id, snapshot.milestoneId));
      await restoreSettlements();
    } else if (input.result === "redeliver") {
      await tx.update(projects).set({ status: "revision" }).where(eq(projects.id, project.id));
      if (milestone) await tx.update(milestones).set({ status: "revision_required" }).where(eq(milestones.id, milestone.id));
      for (const settlement of frozenSettlements) {
        const nextStatus: SettlementStatus = milestone && settlement.milestoneId === milestone.id ? "rejected" : settlementSnapshot.get(settlement.id) ?? "pending";
        await tx.update(settlements).set({ status: nextStatus, frozenReason: null }).where(eq(settlements.id, settlement.id));
      }
    } else if (input.result === "full_refund" || input.result === "partial_refund") {
      if (prepared.kind !== "refund") throw new Error("裁定退款准备记录缺失");
      const refundRows = await tx.select().from(refunds).where(inArray(refunds.id, prepared.refundIds)).for("update");
      if (refundRows.length !== prepared.refundIds.length || refundRows.some((refund) => refund.status !== "success")) throw new Error("裁定退款尚未全部成功");
      refundAmount = addMoney(...refundRows.map((refund) => refund.amount));
      if (input.result === "full_refund") {
        await tx.update(projects).set({ status: "refunded" }).where(eq(projects.id, project.id));
        await tx.update(milestones).set({ status: "cancelled" }).where(and(eq(milestones.projectId, project.id), eq(milestones.status, "disputed")));
        if (snapshot.milestoneId) await tx.update(milestones).set({ status: "cancelled" }).where(eq(milestones.id, snapshot.milestoneId));
        await setFrozenSettlements("rejected");
      } else if (input.continuePerformance) {
        await tx.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
        if (snapshot.milestoneId) await tx.update(milestones).set({ status: continuingMilestoneStatus }).where(eq(milestones.id, snapshot.milestoneId));
        await restoreSettlements();
      } else {
        await tx.update(projects).set({ status: "paused" }).where(eq(projects.id, project.id));
        await tx.update(milestones).set({ status: "cancelled" }).where(and(eq(milestones.projectId, project.id), eq(milestones.status, "disputed")));
        if (snapshot.milestoneId) await tx.update(milestones).set({ status: "cancelled" }).where(eq(milestones.id, snapshot.milestoneId));
        await setFrozenSettlements("rejected");
      }
      for (const refund of refundRows) {
        const escrow = escrows.find((item) => item.paymentId === refund.paymentId);
        await tx.insert(complaintFundActions).values({ complaintId: complaint.id, escrowId: escrow?.id, refundId: refund.id, action: input.result === "full_refund" ? "refund" : "partial_refund", amount: refund.amount, status: "success" });
      }
      await clearFrozenEscrows(false);
    } else if (input.result === "release_all" || input.result === "partial_release") {
      let remainingCents = input.result === "partial_release" ? moneyToCents(normalizeMoney(input.releaseAmount ?? "0")) : 0n;
      let releasedCents = 0n;
      const releasedEscrowIds = new Set<number>();
      for (const escrow of escrows) {
        const availableCents = moneyToCents(subtractMoney(escrow.totalAmount, addMoney(escrow.refundedAmount, escrow.releasedAmount)));
        const amountCents = input.result === "release_all" ? availableCents : (remainingCents < availableCents ? remainingCents : availableCents);
        if (amountCents <= 0n) continue;
        const amount = centsToMoney(amountCents);
        const releaseResult = await tx.insert(escrowReleases).values({
          releaseNo: businessNo("REL"), escrowId: escrow.id, amount, status: "success",
          idempotencyKey: `complaint:${complaint.id}:release:${escrow.id}`, releasedBy: input.operatorId, releasedAt: new Date(),
        });
        const releaseId = Number(releaseResult[0].insertId);
        const totalReleased = addMoney(escrow.releasedAmount, amount);
        const fullyReleased = moneyToCents(addMoney(totalReleased, escrow.refundedAmount)) === moneyToCents(escrow.totalAmount);
        await tx.update(escrowRecords).set({ releasedAmount: totalReleased, status: fullyReleased ? "released" : "partially_released", frozenReason: null }).where(eq(escrowRecords.id, escrow.id));
        await tx.insert(paymentEvents).values({ paymentId: escrow.paymentId, eventType: "complaint_escrow_release", amount, detail: { complaintId: complaint.id, releaseId } });
        await tx.insert(complaintFundActions).values({ complaintId: complaint.id, escrowId: escrow.id, releaseId, action: input.result === "release_all" ? "release" : "partial_release", amount, status: "success" });
        releasedEscrowIds.add(escrow.id);
        releasedCents += amountCents;
        if (input.result === "partial_release") remainingCents -= amountCents;
      }
      if (input.result === "partial_release" && remainingCents !== 0n) throw new Error("裁定释放金额超过全部托管可释放金额");
      if (releasedCents <= 0n) throw new Error("托管释放金额必须大于 0");
      releaseAmount = centsToMoney(releasedCents);
      if (input.result === "release_all") {
        await tx.update(projects).set({ status: "completed", completedAt: new Date() }).where(eq(projects.id, project.id));
        if (milestone) await tx.update(milestones).set({ status: "accepted", acceptedAt: new Date() }).where(eq(milestones.id, milestone.id));
        await setFrozenSettlements("settled", true);
      } else {
        await tx.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
        if (snapshot.milestoneId) await tx.update(milestones).set({ status: continuingMilestoneStatus }).where(eq(milestones.id, snapshot.milestoneId));
        await setFrozenSettlements("pending");
      }
      await clearFrozenEscrows(false, releasedEscrowIds);
    }

    if (["dismiss", "continue_performance", "redeliver"].includes(input.result)) await clearFrozenEscrows(true);

    const disputedFallback: MilestoneStatus = input.result === "full_refund" || (input.result === "partial_refund" && !input.continuePerformance)
      ? "cancelled"
      : input.result === "release_all"
        ? "accepted"
        : input.result === "redeliver" || (input.result === "partial_refund" && input.continuePerformance)
          ? "revision_required"
          : "in_progress";
    await tx.update(milestones).set({ status: disputedFallback }).where(and(eq(milestones.projectId, project.id), eq(milestones.status, "disputed")));
    const projectFallback: ProjectStatus = input.result === "dismiss"
      ? checkedStatus(snapshot.projectPreviousStatus, PROJECT_STATUSES, "项目") === "disputed" ? "in_progress" : checkedStatus(snapshot.projectPreviousStatus, PROJECT_STATUSES, "项目")
      : input.result === "full_refund" ? "refunded"
        : input.result === "release_all" ? "completed"
          : input.result === "redeliver" ? "revision"
            : input.result === "partial_refund" && !input.continuePerformance ? "paused" : "in_progress";
    await tx.update(projects).set({ status: projectFallback }).where(and(eq(projects.id, project.id), eq(projects.status, "disputed")));

    if (input.creditPenalty) {
      const targetUserId = complaint.respondentId;
      const scoreChange = input.creditPenalty === "credit_deduction" ? Math.min(input.scoreChange ?? -10, -1) : 0;
      await tx.insert(complaintCreditActions).values({ complaintId: complaint.id, targetUserId, action: input.creditPenalty, scoreChange, reason: input.reason, status: "applied" });
      if (scoreChange) {
        await tx.insert(creditEvents).values({ userId: targetUserId, eventType: "complaint_penalty", scoreChange, reason: input.reason, refType: "complaint", refId: complaint.id });
        await tx.update(userProfiles).set({ creditScore: sql`GREATEST(${userProfiles.creditScore} + ${scoreChange}, 0)` }).where(eq(userProfiles.userId, targetUserId));
      }
      if (input.creditPenalty === "restrict_orders") await tx.update(users).set({ accountStatus: "restricted" }).where(eq(users.id, targetUserId));
      if (input.creditPenalty === "suspend_account") await tx.update(users).set({ accountStatus: "suspended" }).where(eq(users.id, targetUserId));
    }

    const decisionResult = await tx.insert(complaintDecisions).values({ complaintId: complaint.id, decisionNo: businessNo("DEC"), result: input.result, reason: input.reason, refundAmount, releaseAmount, decidedBy: input.operatorId });
    const decisionId = Number(decisionResult[0].insertId);
    const finalStatus = input.result === "dismiss" ? "rejected" as const : "resolved" as const;
    await tx.update(complaints).set({ status: finalStatus, resolution: input.reason }).where(eq(complaints.id, complaint.id));
    await tx.delete(complaintActiveLocks).where(eq(complaintActiveLocks.complaintId, complaint.id));
    await tx.insert(complaintStatusLogs).values({ complaintId: complaint.id, fromStatus: complaint.status, toStatus: finalStatus, actorId: input.operatorId, note: input.reason });
    await tx.insert(complaintActions).values({ complaintId: complaint.id, actorId: input.operatorId, actorType: "admin", action: "decide", detail: input.reason });
    return { decisionId, finalStatus };
  });
}
