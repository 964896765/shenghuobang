import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  escrowRecords,
  escrowReleases,
  milestones,
  orderStatusLogs,
  orders,
  paymentAttempts,
  paymentEvents,
  payments,
  projects,
  refundAttempts,
  refunds,
  settlementItems,
  settlements,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import {
  assertPaymentAmount,
  assertPaymentConfirmable,
  assertProjectMember,
  assertRefundAmount,
  assertRefundApprovable,
} from "../domain/finance-policy";
import { addMoney, assertPositiveMoney, assertWholeYuan, moneyToCents, normalizeMoney } from "../domain/money";
import { getPaymentProvider } from "../payments/provider-registry";
import type { PaymentProvider } from "../payments/provider";

function businessNo(prefix: string) {
  return `${prefix}${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function providerRequestId(paymentId: number, idempotencyKey: string) {
  return crypto.createHash("sha256").update(`${paymentId}:${idempotencyKey}`).digest("hex");
}

function refundProviderRequestId(refundId: number, attemptNo: number) {
  return crypto.createHash("sha256").update(`refund:${refundId}:attempt:${attemptNo}`).digest("hex");
}

export async function createPayment(input: { orderId: number; payerId: number; amount: string | number; idempotencyKey: string }, provider: PaymentProvider = getPaymentProvider()) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
    const order = orderRows[0];
    if (!order) throw new Error("订单不存在");
    if (order.buyerId !== input.payerId) throw new Error("只有订单付款方可以创建支付单");
    if (order.status !== "pending_payment") throw new Error("当前订单状态不能创建支付单");
    const amount = normalizeMoney(input.amount);
    assertWholeYuan(amount);
    assertPaymentAmount(order.amount, amount);

    const idempotentRows = await tx.select().from(payments).where(and(
      eq(payments.payerId, input.payerId),
      eq(payments.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    const idempotent = idempotentRows[0];
    if (idempotent) {
      if (idempotent.orderId !== order.id || moneyToCents(idempotent.amount) !== moneyToCents(amount)) {
        throw new Error("幂等键已用于其他支付请求");
      }
      return idempotent;
    }

    const activeRows = await tx.select().from(payments).where(and(
      eq(payments.orderId, order.id),
      inArray(payments.status, ["created", "pending", "success"]),
    )).limit(1);
    if (activeRows[0]) return activeRows[0];

    const result = await tx.insert(payments).values({
      paymentNo: businessNo("PAY"),
      orderId: order.id,
      payerId: input.payerId,
      amount,
      provider: provider.name,
      status: "created",
      idempotencyKey: input.idempotencyKey,
    });
    const id = Number(result[0].insertId);
    await tx.insert(paymentEvents).values({ paymentId: id, eventType: "payment_created", amount, detail: { orderId: order.id } });
    const created = await tx.select().from(payments).where(eq(payments.id, id)).limit(1);
    return created[0];
  });
}

export async function confirmPayment(input: { paymentId: number; payerId: number; idempotencyKey: string }, provider: PaymentProvider = getPaymentProvider()) {
  const db = await requireDb();

  const prepared = await db.transaction(async (tx) => {
    const paymentRows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update").limit(1);
    const payment = paymentRows[0];
    if (!payment) throw new Error("支付单不存在");
    if (payment.payerId !== input.payerId) throw new Error("无权确认该支付单");
    if (assertPaymentConfirmable(payment.status) === "already_success") return { kind: "already" as const, payment };
    if (payment.provider !== provider.name) throw new Error("支付单提供商与当前配置不一致");

    const orderRows = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update").limit(1);
    const order = orderRows[0];
    if (!order) throw new Error("订单不存在");
    if (order.status !== "pending_payment") {
      throw new Error("ORDER_NOT_AWAITING_PAYMENT");
    }
    assertPaymentAmount(order.amount, payment.amount);

    const requestId = providerRequestId(payment.id, input.idempotencyKey);
    const existingAttempt = await tx.select().from(paymentAttempts).where(and(
      eq(paymentAttempts.provider, provider.name),
      eq(paymentAttempts.providerRequestId, requestId),
    )).limit(1);
    let attemptId = existingAttempt[0]?.id;
    if (attemptId) {
      await tx.update(paymentAttempts).set({ status: "pending", failedReason: null, responseData: null, completedAt: null }).where(eq(paymentAttempts.id, attemptId));
    } else {
      const attemptCount = await tx.select({ count: sql<number>`count(*)` }).from(paymentAttempts).where(eq(paymentAttempts.paymentId, payment.id));
      const attemptNo = Number(attemptCount[0]?.count ?? 0) + 1;
      const attemptResult = await tx.insert(paymentAttempts).values({
        paymentId: payment.id,
        attemptNo,
        provider: provider.name,
        providerRequestId: requestId,
        status: "pending",
        requestData: { paymentNo: payment.paymentNo, amount: payment.amount, currency: payment.currency },
      });
      attemptId = Number(attemptResult[0].insertId);
    }
    await tx.update(payments).set({ status: "pending", failedReason: null }).where(eq(payments.id, payment.id));
    return { kind: "call_provider" as const, payment, order, attemptId, requestId };
  });

  if (prepared.kind === "already") return { payment: prepared.payment, alreadyConfirmed: true };

  let providerResult: Awaited<ReturnType<typeof provider.confirmPayment>>;
  try {
    providerResult = await provider.confirmPayment({
      paymentNo: prepared.payment.paymentNo,
      amount: prepared.payment.amount,
      currency: prepared.payment.currency,
      // Provider idempotency is stable per payment, even if callers use different confirmation keys.
      idempotencyKey: prepared.payment.idempotencyKey,
    });
  } catch (error) {
    providerResult = {
      success: false,
      failedReason: error instanceof Error ? error.message : "支付提供商调用异常",
      raw: { providerException: true },
    };
  }

  if (!providerResult.success || !providerResult.providerTransactionNo) {
    const failedReason = providerResult.failedReason ?? "支付提供商确认失败";
    await db.transaction(async (tx) => {
      const current = (await tx.select().from(payments).where(eq(payments.id, prepared.payment.id)).for("update").limit(1))[0];
      await tx.update(paymentAttempts).set({ status: "failed", responseData: providerResult.raw, failedReason, completedAt: new Date() }).where(eq(paymentAttempts.id, prepared.attemptId));
      if (current?.status !== "success") {
        await tx.update(payments).set({ status: "failed", failedReason }).where(eq(payments.id, prepared.payment.id));
        await tx.insert(paymentEvents).values({ paymentId: prepared.payment.id, eventType: "payment_failed", amount: prepared.payment.amount, detail: { reason: failedReason, attemptId: prepared.attemptId } });
      }
    });
    throw new Error(failedReason);
  }

  return db.transaction(async (tx) => {
    const payment = (await tx.select().from(payments).where(eq(payments.id, prepared.payment.id)).for("update").limit(1))[0];
    if (!payment) throw new Error("支付单不存在");
    const now = new Date();
    await tx.update(paymentAttempts).set({ status: "success", responseData: providerResult.raw, failedReason: null, completedAt: now }).where(eq(paymentAttempts.id, prepared.attemptId));
    if (payment.status === "success") return { payment, alreadyConfirmed: true };
    const order = (await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update").limit(1))[0];
    if (!order) throw new Error("订单不存在");
    if (order.status !== "pending_payment") {
      throw new Error("ORDER_NOT_AWAITING_PAYMENT");
    }
    assertPaymentAmount(order.amount, payment.amount);
    await tx.update(payments).set({ status: "success", providerTransactionNo: providerResult.providerTransactionNo, paidAt: now, failedReason: null }).where(eq(payments.id, payment.id));
    await tx.update(orders).set({ status: "pending_delivery", paidAt: now }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: order.status, toStatus: "pending_delivery", note: "沙箱支付确认成功，款项进入托管" });

    const projectId = order.orderType === "project" ? order.refId : null;
    const escrowResult = await tx.insert(escrowRecords).values({
      escrowNo: businessNo("ESC"), paymentId: payment.id, orderId: order.id, projectId,
      payerId: payment.payerId, payeeId: order.sellerId, totalAmount: payment.amount, fundedAmount: payment.amount,
      status: "funded", fundedAt: now,
    });
    const escrowId = Number(escrowResult[0].insertId);
    await tx.insert(paymentEvents).values({
      paymentId: payment.id,
      eventType: "payment_succeeded_and_escrow_funded",
      amount: payment.amount,
      externalEventNo: `${provider.name.toUpperCase()}-EVT-${prepared.requestId.slice(0, 32)}`,
      detail: { orderId: order.id, escrowId },
    });

    if (projectId) {
      await tx.update(projects).set({ status: "in_progress", startedAt: now }).where(and(eq(projects.id, projectId), eq(projects.status, "pending_payment")));
      const first = await tx.select().from(milestones).where(and(eq(milestones.projectId, projectId), eq(milestones.status, "pending"))).orderBy(milestones.sortOrder).limit(1);
      if (first[0]) await tx.update(milestones).set({ status: "in_progress" }).where(eq(milestones.id, first[0].id));
    }

    const latest = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    return { payment: latest[0], alreadyConfirmed: false };
  });
}

export async function getPaymentForUser(paymentId: number, userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  const payment = rows[0];
  if (!payment) throw new Error("支付单不存在");
  const orderRows = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
  const order = orderRows[0];
  if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw new Error("无权查看该支付单");
  return { payment, order };
}

export async function getPaymentByOrderForUser(orderId: number, userId: number) {
  const db = await requireDb();
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = orderRows[0];
  if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw new Error("无权查看订单资金数据");
  const paymentRows = await db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.createdAt)).limit(1);
  const escrowRows = paymentRows[0]
    ? await db.select().from(escrowRecords).where(eq(escrowRecords.paymentId, paymentRows[0].id)).limit(1)
    : [];
  return { order, payment: paymentRows[0] ?? null, escrow: escrowRows[0] ?? null };
}

export async function getProjectFinance(projectId: number, userId: number) {
  const db = await requireDb();
  const projectRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = projectRows[0];
  if (!project) throw new Error("项目不存在");
  assertProjectMember(project.ownerId, project.engineerId, userId);
  const [escrows, settlementRows] = await Promise.all([
    db.select().from(escrowRecords).where(eq(escrowRecords.projectId, projectId)),
    db.select().from(settlements).where(eq(settlements.projectId, projectId)).orderBy(desc(settlements.createdAt)),
  ]);
  return { escrows, settlements: settlementRows };
}

export async function submitRefund(input: { paymentId: number; requesterId: number; amount: string | number; reason: string; idempotencyKey: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const paymentRows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update").limit(1);
    const payment = paymentRows[0];
    if (!payment) throw new Error("支付单不存在");
    if (payment.payerId !== input.requesterId) throw new Error("只有付款方可以申请退款");
    if (!(["success", "partially_refunded"] as typeof payment.status[]).includes(payment.status)) throw new Error("当前支付状态不能退款");
    const amount = normalizeMoney(input.amount);
    assertWholeYuan(amount);
    const idempotentRows = await tx.select().from(refunds).where(and(eq(refunds.requesterId, input.requesterId), eq(refunds.idempotencyKey, input.idempotencyKey))).limit(1);
    if (idempotentRows[0]) return idempotentRows[0];
    const previous = await tx.select().from(refunds).where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ["approved", "processing", "success"])));
    const alreadyRefunded = previous.reduce((sum, item) => addMoney(sum, item.amount), "0.00");
    assertRefundAmount(amount, payment.amount, alreadyRefunded);
    const result = await tx.insert(refunds).values({
      refundNo: businessNo("REF"), paymentId: payment.id, orderId: payment.orderId, requesterId: input.requesterId,
      amount, reason: input.reason, status: "submitted", idempotencyKey: input.idempotencyKey,
    });
    const id = Number(result[0].insertId);
    await tx.update(payments).set({ status: "refunding" }).where(eq(payments.id, payment.id));
    const created = await tx.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    return created[0];
  });
}

export async function approveRefund(refundId: number, reviewerId: number, reviewReason: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update").limit(1);
    const refund = rows[0];
    if (!refund) throw new Error("退款申请不存在");
    assertRefundApprovable(refund.status);
    await tx.update(refunds).set({ status: "approved", reviewedBy: reviewerId, reviewReason, reviewedAt: new Date() }).where(eq(refunds.id, refund.id));
    await tx.insert(paymentEvents).values({ paymentId: refund.paymentId, eventType: "refund_approved", amount: refund.amount, detail: { refundId, reviewerId } });
    return { ...refund, status: "approved" as const };
  });
}

export async function rejectRefund(refundId: number, reviewerId: number, reviewReason: string) {
  if (!reviewReason.trim()) throw new Error("拒绝退款必须填写原因");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update").limit(1);
    const refund = rows[0];
    if (!refund) throw new Error("退款申请不存在");
    assertRefundApprovable(refund.status);
    const succeeded = await tx.select().from(refunds).where(and(eq(refunds.paymentId, refund.paymentId), eq(refunds.status, "success")));
    const hasPartialRefund = succeeded.length > 0;
    await tx.update(refunds).set({ status: "rejected", reviewedBy: reviewerId, reviewReason, reviewedAt: new Date() }).where(eq(refunds.id, refund.id));
    await tx.update(payments).set({ status: hasPartialRefund ? "partially_refunded" : "success" }).where(eq(payments.id, refund.paymentId));
    await tx.insert(paymentEvents).values({ paymentId: refund.paymentId, eventType: "refund_rejected", amount: refund.amount, detail: { refundId, reviewerId, reviewReason } });
    return { ...refund, status: "rejected" as const, reviewReason };
  });
}

export async function executeApprovedRefund(refundId: number, operatorId: number, provider: PaymentProvider = getPaymentProvider()) {
  const db = await requireDb();
  const prepared = await db.transaction(async (tx) => {
    const refundRows = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update").limit(1);
    const refund = refundRows[0];
    if (!refund) throw new Error("退款申请不存在");
    if (refund.status === "success") return { kind: "already" as const, refund };
    if (!["approved", "processing", "failed"].includes(refund.status)) throw new Error("退款尚未批准或当前状态不能执行");
    const paymentRows = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).for("update").limit(1);
    const payment = paymentRows[0];
    if (!payment?.providerTransactionNo) throw new Error("支付交易号不存在");
    if (payment.provider !== provider.name) throw new Error("退款提供商与原支付单不一致");
    const escrowRows = await tx.select().from(escrowRecords).where(eq(escrowRecords.paymentId, payment.id)).for("update").limit(1);
    const escrow = escrowRows[0];
    if (!escrow) throw new Error("托管记录不存在");
    assertRefundAmount(refund.amount, escrow.totalAmount, escrow.refundedAmount);
    const order = (await tx.select().from(orders).where(eq(orders.id, refund.orderId)).for("update").limit(1))[0];
    if (!order) throw new Error("退款关联订单不存在");

    let attempt = (await tx.select().from(refundAttempts).where(and(
      eq(refundAttempts.refundId, refund.id),
      eq(refundAttempts.status, "pending"),
    )).orderBy(desc(refundAttempts.attemptNo)).limit(1))[0];
    if (!attempt) {
      const counts = await tx.select({ count: sql<number>`count(*)` }).from(refundAttempts).where(eq(refundAttempts.refundId, refund.id));
      const attemptNo = Number(counts[0]?.count ?? 0) + 1;
      const providerIdempotencyKey = `${refund.idempotencyKey}:attempt:${attemptNo}`;
      const result = await tx.insert(refundAttempts).values({
        refundId: refund.id,
        attemptNo,
        provider: provider.name,
        providerRequestId: refundProviderRequestId(refund.id, attemptNo),
        providerIdempotencyKey,
        operatorId,
        orderPreviousStatus: order.status === "refunding" ? "pending_delivery" : order.status,
        status: "pending",
        requestData: {
          refundNo: refund.refundNo,
          providerTransactionNo: payment.providerTransactionNo,
          amount: refund.amount,
          currency: refund.currency,
          idempotencyKey: providerIdempotencyKey,
        },
      });
      attempt = (await tx.select().from(refundAttempts).where(eq(refundAttempts.id, Number(result[0].insertId))).limit(1))[0];
    }
    if (!attempt) throw new Error("无法创建退款尝试记录");
    await tx.update(refunds).set({ status: "processing", failedReason: null }).where(eq(refunds.id, refund.id));
    await tx.update(payments).set({ status: "refunding" }).where(eq(payments.id, payment.id));
    if (order.status !== "refunding") {
      await tx.update(orders).set({ status: "refunding" }).where(eq(orders.id, order.id));
      await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: order.status, toStatus: "refunding", note: `退款尝试 #${attempt.attemptNo} 执行中` });
    }
    return { kind: "call_provider" as const, refund, payment, escrow, attempt };
  });

  if (prepared.kind === "already") return { refund: prepared.refund, alreadyExecuted: true };

  let result: Awaited<ReturnType<typeof provider.refund>>;
  try {
    result = await provider.refund({
      refundNo: prepared.refund.refundNo,
      providerTransactionNo: prepared.payment.providerTransactionNo!,
      amount: prepared.refund.amount,
      currency: prepared.refund.currency,
      idempotencyKey: prepared.attempt.providerIdempotencyKey,
    });
  } catch (error) {
    result = { success: false, failedReason: error instanceof Error ? error.message : "退款提供商调用异常", raw: { providerException: true } };
  }

  if (!result.success || !result.providerRefundNo) {
    const failedReason = result.failedReason ?? "退款提供商执行失败";
    await db.transaction(async (tx) => {
      const refund = (await tx.select().from(refunds).where(eq(refunds.id, prepared.refund.id)).for("update").limit(1))[0];
      if (refund?.status !== "success") {
        const succeeded = await tx.select().from(refunds).where(and(eq(refunds.paymentId, prepared.payment.id), eq(refunds.status, "success")));
        const order = (await tx.select().from(orders).where(eq(orders.id, prepared.refund.orderId)).for("update").limit(1))[0];
        await tx.update(refundAttempts).set({ status: "failed", responseData: result.raw, failedReason, completedAt: new Date() }).where(eq(refundAttempts.id, prepared.attempt.id));
        await tx.update(refunds).set({ status: "failed", failedReason }).where(eq(refunds.id, prepared.refund.id));
        await tx.update(payments).set({ status: succeeded.length > 0 ? "partially_refunded" : "success" }).where(eq(payments.id, prepared.payment.id));
        if (order?.status === "refunding") {
          const previousStatus = prepared.attempt.orderPreviousStatus as typeof order.status;
          await tx.update(orders).set({ status: previousStatus }).where(eq(orders.id, order.id));
          await tx.insert(orderStatusLogs).values({ orderId: order.id, fromStatus: "refunding", toStatus: previousStatus, note: `退款尝试 #${prepared.attempt.attemptNo} 失败，恢复履约状态` });
        }
        await tx.insert(paymentEvents).values({ paymentId: prepared.payment.id, eventType: "refund_failed", amount: prepared.refund.amount, detail: { refundId: prepared.refund.id, attemptId: prepared.attempt.id, attemptNo: prepared.attempt.attemptNo, reason: failedReason, operatorId } });
      }
    });
    throw new Error(failedReason);
  }

  return db.transaction(async (tx) => {
    const refund = (await tx.select().from(refunds).where(eq(refunds.id, prepared.refund.id)).for("update").limit(1))[0];
    if (!refund) throw new Error("退款申请不存在");
    if (refund.status === "success") {
      await tx.update(refundAttempts).set({ status: "success", responseData: result.raw, failedReason: null, completedAt: new Date() }).where(eq(refundAttempts.id, prepared.attempt.id));
      return { refund, alreadyExecuted: true };
    }
    if (refund.status !== "processing") throw new Error("退款执行状态已变化");
    const payment = (await tx.select().from(payments).where(eq(payments.id, prepared.payment.id)).for("update").limit(1))[0];
    const escrow = (await tx.select().from(escrowRecords).where(eq(escrowRecords.id, prepared.escrow.id)).for("update").limit(1))[0];
    if (!payment || !escrow) throw new Error("退款关联资金记录不存在");
    assertRefundAmount(refund.amount, escrow.totalAmount, escrow.refundedAmount);
    const totalRefunded = addMoney(escrow.refundedAmount, refund.amount);
    const full = moneyToCents(totalRefunded) === moneyToCents(escrow.totalAmount);
    const now = new Date();
    const order = (await tx.select().from(orders).where(eq(orders.id, refund.orderId)).for("update").limit(1))[0];
    if (!order) throw new Error("退款关联订单不存在");
    await tx.update(refundAttempts).set({ status: "success", responseData: result.raw, failedReason: null, completedAt: now }).where(eq(refundAttempts.id, prepared.attempt.id));
    await tx.update(refunds).set({ status: "success", providerRefundNo: result.providerRefundNo, failedReason: null, completedAt: now }).where(eq(refunds.id, refund.id));
    await tx.update(payments).set({ status: full ? "refunded" : "partially_refunded" }).where(eq(payments.id, payment.id));
    await tx.update(escrowRecords).set({ refundedAmount: totalRefunded, status: full ? "refunded" : "partially_refunded" }).where(eq(escrowRecords.id, escrow.id));
    const orderStatus = full ? "refunded" as const : "partially_refunded" as const;
    await tx.update(orders).set({ status: orderStatus }).where(eq(orders.id, refund.orderId));
    if (full && escrow.projectId) await tx.update(projects).set({ status: "refunded" }).where(eq(projects.id, escrow.projectId));
    await tx.insert(orderStatusLogs).values({ orderId: refund.orderId, fromStatus: order.status, toStatus: orderStatus, note: full ? "退款完成" : "部分退款完成，订单保留部分退款状态" });
    await tx.insert(paymentEvents).values({ paymentId: payment.id, eventType: full ? "refund_succeeded" : "partial_refund_succeeded", amount: refund.amount, detail: { refundId, attemptId: prepared.attempt.id, attemptNo: prepared.attempt.attemptNo, operatorId, escrowId: escrow.id } });
    const latest = await tx.select().from(refunds).where(eq(refunds.id, refund.id)).limit(1);
    return { refund: latest[0], alreadyExecuted: false };
  });
}

export async function retryFailedRefund(refundId: number, operatorId: number, provider: PaymentProvider = getPaymentProvider()) {
  const db = await requireDb();
  const refund = (await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1))[0];
  if (!refund) throw new Error("退款申请不存在");
  if (refund.status !== "failed") throw new Error("只有失败退款可以重试");
  return executeApprovedRefund(refundId, operatorId, provider);
}

export async function listRefundsForAdmin() {
  const db = await requireDb();
  return db.select().from(refunds).orderBy(desc(refunds.createdAt)).limit(200);
}

export async function listRefundsForUser(userId: number) {
  const db = await requireDb();
  return db.select().from(refunds).where(eq(refunds.requesterId, userId)).orderBy(desc(refunds.createdAt)).limit(100);
}

export async function listSettlementsForAdmin() {
  const db = await requireDb();
  return db.select().from(settlements).orderBy(desc(settlements.createdAt)).limit(200);
}

export async function approveSettlement(settlementId: number, reviewerId: number) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update").limit(1);
    const settlement = rows[0];
    if (!settlement) throw new Error("结算申请不存在");
    if (!(["pending", "under_review"] as typeof settlement.status[]).includes(settlement.status)) throw new Error("结算申请不能重复批准");
    await tx.update(settlements).set({ status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(settlements.id, settlement.id));
    return { ...settlement, status: "approved" as const };
  });
}

export async function releaseSettlement(input: { settlementId: number; operatorId: number; idempotencyKey: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const settlementRows = await tx.select().from(settlements).where(eq(settlements.id, input.settlementId)).for("update").limit(1);
    const settlement = settlementRows[0];
    if (!settlement) throw new Error("结算申请不存在");
    const existingRelease = await tx.select().from(escrowReleases).where(eq(escrowReleases.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existingRelease[0]) return existingRelease[0];
    if (settlement.status !== "approved") throw new Error("结算尚未批准或已处理");
    const escrowRows = await tx.select().from(escrowRecords).where(eq(escrowRecords.projectId, settlement.projectId)).for("update").limit(1);
    const escrow = escrowRows[0];
    if (!escrow) throw new Error("项目托管记录不存在");
    if (escrow.status === "frozen") throw new Error("投诉处理中，托管资金已冻结");
    const unavailable = addMoney(escrow.releasedAmount, escrow.refundedAmount);
    assertPositiveMoney(settlement.amount, "托管释放金额必须大于 0");
    assertRefundAmount(settlement.amount, escrow.totalAmount, unavailable);
    const releaseResult = await tx.insert(escrowReleases).values({
      releaseNo: businessNo("REL"), escrowId: escrow.id, settlementId: settlement.id, amount: settlement.amount,
      status: "success", idempotencyKey: input.idempotencyKey, releasedBy: input.operatorId, releasedAt: new Date(),
    });
    const releasedAmount = addMoney(escrow.releasedAmount, settlement.amount);
    const fullyReleased = moneyToCents(addMoney(releasedAmount, escrow.refundedAmount)) === moneyToCents(escrow.totalAmount);
    await tx.update(escrowRecords).set({ releasedAmount, status: fullyReleased ? "released" : "partially_released" }).where(eq(escrowRecords.id, escrow.id));
    await tx.update(settlements).set({ status: "settled", settledAt: new Date() }).where(eq(settlements.id, settlement.id));
    await tx.insert(paymentEvents).values({ paymentId: escrow.paymentId, eventType: "escrow_released", amount: settlement.amount, detail: { settlementId: settlement.id, operatorId: input.operatorId } });
    const releaseId = Number(releaseResult[0].insertId);
    const releaseRows = await tx.select().from(escrowReleases).where(eq(escrowReleases.id, releaseId)).limit(1);
    return releaseRows[0];
  });
}

export async function settlementDetailForMember(settlementId: number, userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(settlements).where(eq(settlements.id, settlementId)).limit(1);
  const settlement = rows[0];
  if (!settlement) throw new Error("结算申请不存在");
  const projectRows = await db.select().from(projects).where(eq(projects.id, settlement.projectId)).limit(1);
  const project = projectRows[0];
  if (!project) throw new Error("项目不存在");
  assertProjectMember(project.ownerId, project.engineerId, userId);
  const items = await db.select().from(settlementItems).where(eq(settlementItems.settlementId, settlement.id));
  return { settlement, items };
}
