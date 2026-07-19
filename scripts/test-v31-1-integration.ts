import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { PaymentProvider, ProviderPaymentRequest, ProviderPaymentResult, ProviderRefundRequest, ProviderRefundResult } from "../server/payments/provider";

const DATABASE_NAME = "shenghuobang_v311_integration";

class FailingSandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  constructor(private readonly failure: "payment" | "refund") {}
  async confirmPayment(_request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    return this.failure === "payment"
      ? { success: false, failedReason: "INTEGRATION_PAYMENT_FAILURE", raw: { injected: true } }
      : { success: true, providerTransactionNo: "SBX-PAY-INTEGRATION", raw: { injected: false } };
  }
  async queryPayment(providerTransactionNo: string): Promise<ProviderPaymentResult> {
    return { success: true, providerTransactionNo, raw: { integration: true } };
  }
  async refund(_request: ProviderRefundRequest): Promise<ProviderRefundResult> {
    return this.failure === "refund"
      ? { success: false, failedReason: "INTEGRATION_REFUND_FAILURE", raw: { injected: true } }
      : { success: true, providerRefundNo: "SBX-REF-INTEGRATION", raw: { injected: false } };
  }
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`集成测试失败：${message}`);
}

async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}

async function main() {
  const sourceUrl = new URL(process.env.MYSQL_INTEGRATION_URL ?? process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/mysql");
  const admin = await mysql.createConnection({
    host: sourceUrl.hostname,
    port: Number(sourceUrl.port || 3306),
    user: decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
    multipleStatements: true,
  });
  const testUrl = new URL(sourceUrl.toString());
  testUrl.pathname = `/${DATABASE_NAME}`;
  const results: string[] = [];

  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await admin.query(`USE \`${DATABASE_NAME}\``);
    for (const file of [
      "0000_elite_eternals.sql",
      "0001_neat_omega_flight.sql",
      "0002_bizarre_rachel_grey.sql",
      "0003_spotty_captain_flint.sql",
      "0004_yummy_storm.sql",
      "0005_silky_squadron_supreme.sql",
      "0006_steady_wild_child.sql",
    ]) {
      const sql = (await readFile(path.resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", "");
      await admin.query(sql);
    }

    process.env.DATABASE_URL = testUrl.toString();
    process.env.PAYMENT_PROVIDER = "sandbox";
    const finance = await import("../server/services/finance-service");
    const complaint = await import("../server/services/complaint-service");
    const { paymentProviderRegistry } = await import("../server/payments/provider-registry");
    const { sandboxPaymentProvider } = await import("../server/payments/sandbox-provider");

    const [user1] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v311:u1", "18800000111", "integration", "集成买家"]);
    const [user2] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v311:u2", "18800000112", "integration", "集成卖家"]);
    const buyerId = user1.insertId;
    const sellerId = user2.insertId;

    const createOrder = async (title: string, amount = 100, orderType: "listing" | "project" = "listing", refId = 1) => {
      const [result] = await admin.execute<ResultSetHeader>(
        "INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status) VALUES (?,?,?,?,?,?,'pending_payment')",
        [orderType, buyerId, sellerId, refId, title, amount],
      );
      return result.insertId;
    };
    const createAndPay = async (orderId: number, key: string) => {
      const payment = await finance.createPayment({ orderId, payerId: buyerId, amount: "100.00", idempotencyKey: `${key}:create` });
      await finance.confirmPayment({ paymentId: payment.id, payerId: buyerId, idempotencyKey: `${key}:confirm` });
      return payment;
    };

    // 1. Payment success synchronizes payment, order and escrow.
    const successOrderId = await createOrder("支付成功三表同步");
    const successPayment = await createAndPay(successOrderId, "success");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payments WHERE id=? AND status='success'", [successPayment.id]) === 1, "支付单未成功");
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [successOrderId]) === "pending_delivery", "订单未同步");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE paymentId=? AND status='funded'", [successPayment.id]) === 1, "托管未同步");
    results.push("支付成功三表同步");

    // 2. Payment failure remains committed after the service throws.
    const failingPaymentProvider = new FailingSandboxProvider("payment");
    paymentProviderRegistry.register(failingPaymentProvider);
    check(paymentProviderRegistry.resolve("sandbox") === failingPaymentProvider, "Provider Registry 未返回注册实例");
    const failedOrderId = await createOrder("支付失败持久化");
    const failedPayment = await finance.createPayment({ orderId: failedOrderId, payerId: buyerId, amount: "100.00", idempotencyKey: "payment-fail:create" });
    await finance.confirmPayment({ paymentId: failedPayment.id, payerId: buyerId, idempotencyKey: "payment-fail:confirm" }, failingPaymentProvider).then(
      () => { throw new Error("预期支付失败但调用成功"); },
      () => undefined,
    );
    check(await scalar<string>(admin, "SELECT status value FROM payments WHERE id=?", [failedPayment.id]) === "failed", "支付 failed 状态被回滚");
    check(await scalar<string>(admin, "SELECT status value FROM payment_attempts WHERE paymentId=?", [failedPayment.id]) === "failed", "attempt failed 状态被回滚");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payment_events WHERE paymentId=? AND eventType='payment_failed'", [failedPayment.id]) === 1, "支付失败事件缺失");
    check((await scalar<string>(admin, "SELECT failedReason value FROM payments WHERE id=?", [failedPayment.id])) === "INTEGRATION_PAYMENT_FAILURE", "支付失败原因缺失");
    results.push("支付失败记录保留");
    paymentProviderRegistry.register(sandboxPaymentProvider);

    // 3. Concurrent confirmation creates one payment success ledger and one escrow.
    const concurrentOrderId = await createOrder("并发重复支付");
    const concurrentPayment = await finance.createPayment({ orderId: concurrentOrderId, payerId: buyerId, amount: "100.00", idempotencyKey: "concurrent:create" });
    const concurrentResults = await Promise.allSettled([
      finance.confirmPayment({ paymentId: concurrentPayment.id, payerId: buyerId, idempotencyKey: "concurrent:a" }),
      finance.confirmPayment({ paymentId: concurrentPayment.id, payerId: buyerId, idempotencyKey: "concurrent:b" }),
    ]);
    check(concurrentResults.some((item) => item.status === "fulfilled"), "并发支付均失败");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payments WHERE id=? AND status='success'", [concurrentPayment.id]) === 1, "并发支付产生异常状态");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE paymentId=?", [concurrentPayment.id]) === 1, "并发支付重复创建托管");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payment_events WHERE paymentId=? AND eventType='payment_succeeded_and_escrow_funded'", [concurrentPayment.id]) === 1, "并发支付重复记账");
    results.push("并发重复支付只入账一次");

    // 4. Refund provider failure remains committed.
    const refundFailOrderId = await createOrder("退款失败持久化");
    const refundFailPayment = await createAndPay(refundFailOrderId, "refund-fail-payment");
    const failedRefund = await finance.submitRefund({ paymentId: refundFailPayment.id, requesterId: buyerId, amount: "40.00", reason: "集成退款失败", idempotencyKey: "refund-fail" });
    await finance.approveRefund(failedRefund.id, sellerId, "集成批准");
    const failingRefundProvider = new FailingSandboxProvider("refund");
    paymentProviderRegistry.register(failingRefundProvider);
    await finance.executeApprovedRefund(failedRefund.id, sellerId, failingRefundProvider).then(
      () => { throw new Error("预期退款失败但调用成功"); },
      () => undefined,
    );
    check(await scalar<string>(admin, "SELECT status value FROM refunds WHERE id=?", [failedRefund.id]) === "failed", "退款 failed 状态被回滚");
    check(await scalar<string>(admin, "SELECT failedReason value FROM refunds WHERE id=?", [failedRefund.id]) === "INTEGRATION_REFUND_FAILURE", "退款失败原因缺失");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payment_events WHERE paymentId=? AND eventType='refund_failed'", [refundFailPayment.id]) === 1, "退款失败事件缺失");
    results.push("退款失败记录保留");
    paymentProviderRegistry.register(sandboxPaymentProvider);

    // 5/6. Partial refund and duplicate execution.
    const partialOrderId = await createOrder("部分退款与重复执行");
    const partialPayment = await createAndPay(partialOrderId, "partial-payment");
    const partialRefund = await finance.submitRefund({ paymentId: partialPayment.id, requesterId: buyerId, amount: "40.00", reason: "集成部分退款", idempotencyKey: "partial-refund" });
    await finance.approveRefund(partialRefund.id, sellerId, "集成批准");
    const firstExecution = await finance.executeApprovedRefund(partialRefund.id, sellerId);
    const secondExecution = await finance.executeApprovedRefund(partialRefund.id, sellerId);
    check(firstExecution.refund.status === "success", "部分退款未成功");
    check(secondExecution.alreadyExecuted, "重复退款未被识别");
    check(await scalar<string>(admin, "SELECT status value FROM payments WHERE id=?", [partialPayment.id]) === "partially_refunded", "支付单未同步部分退款");
    check(await scalar<string>(admin, "SELECT status value FROM escrow_records WHERE paymentId=?", [partialPayment.id]) === "partially_refunded", "托管未同步部分退款");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM payment_events WHERE paymentId=? AND eventType='partial_refund_succeeded'", [partialPayment.id]) === 1, "退款被重复执行");
    results.push("部分退款");
    results.push("同一退款不能重复执行");

    // Project fixture with paid escrow, milestone and settlement.
    const [projectResult] = await admin.execute<ResultSetHeader>(
      "INSERT INTO projects (needId,quoteId,ownerId,engineerId,title,totalAmount,status,startedAt) VALUES (?,?,?,?,?,?,'in_progress',NOW())",
      [9001, 9001, buyerId, sellerId, "投诉集成项目", 100],
    );
    const projectId = projectResult.insertId;
    const [milestoneResult] = await admin.execute<ResultSetHeader>(
      "INSERT INTO milestones (projectId,title,amount,sortOrder,status) VALUES (?,?,100,1,'waiting_acceptance')",
      [projectId, "投诉里程碑"],
    );
    const milestoneId = milestoneResult.insertId;
    const projectOrderId = await createOrder("投诉项目订单", 100, "project", projectId);
    await createAndPay(projectOrderId, "complaint-payment");
    await admin.execute(
      "INSERT INTO settlements (settlementNo,projectId,milestoneId,payeeId,amount,status,idempotencyKey) VALUES (?,?,?,?,100,'pending',?)",
      [`SET-INTEGRATION-${projectId}`, projectId, milestoneId, sellerId, `settlement-integration-${projectId}`],
    );

    // 7. Complaint freezes project, milestone, escrow and settlement.
    const firstComplaint = await complaint.createComplaintAndFreeze({ complainantId: buyerId, relatedType: "milestone", relatedId: milestoneId, complaintType: "delivery", description: "集成投诉冻结验证" });
    check(await scalar<string>(admin, "SELECT status value FROM projects WHERE id=?", [projectId]) === "disputed", "投诉未冻结项目");
    check(await scalar<string>(admin, "SELECT status value FROM milestones WHERE id=?", [milestoneId]) === "disputed", "投诉未冻结里程碑");
    check(await scalar<string>(admin, "SELECT status value FROM escrow_records WHERE projectId=?", [projectId]) === "frozen", "投诉未冻结托管");
    check(await scalar<string>(admin, "SELECT status value FROM settlements WHERE projectId=?", [projectId]) === "frozen", "投诉未冻结结算");
    results.push("投诉冻结");

    // 8/10. Duplicate active complaint rejected, then dismiss restores the snapshot.
    await complaint.createComplaintAndFreeze({ complainantId: buyerId, relatedType: "project", relatedId: projectId, complaintType: "duplicate", description: "不应创建" }).then(
      () => { throw new Error("同一项目创建了第二个活动投诉"); },
      () => undefined,
    );
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM complaint_active_locks WHERE projectId=?", [projectId]) === 1, "活动投诉锁异常");
    results.push("同一项目不能创建两个活动投诉");
    await complaint.decideComplaint({ complaintId: firstComplaint.complaintId, operatorId: sellerId, result: "dismiss", reason: "集成测试驳回并恢复" });
    check(await scalar<string>(admin, "SELECT status value FROM projects WHERE id=?", [projectId]) === "in_progress", "驳回后项目未恢复");
    check(await scalar<string>(admin, "SELECT status value FROM milestones WHERE id=?", [milestoneId]) === "waiting_acceptance", "驳回后里程碑未恢复");
    check(await scalar<string>(admin, "SELECT status value FROM settlements WHERE projectId=?", [projectId]) === "pending", "驳回后结算未恢复");
    check(await scalar<string>(admin, "SELECT status value FROM escrow_records WHERE projectId=?", [projectId]) === "funded", "驳回后托管未恢复");
    results.push("投诉驳回后项目恢复");

    // 9. Complaint full refund resolves every frozen settlement.
    const refundComplaint = await complaint.createComplaintAndFreeze({ complainantId: buyerId, relatedType: "project", relatedId: projectId, complaintType: "refund", description: "集成投诉退款验证" });
    await complaint.decideComplaint({ complaintId: refundComplaint.complaintId, operatorId: sellerId, result: "full_refund", reason: "集成测试全额退款" });
    check(await scalar<string>(admin, "SELECT status value FROM projects WHERE id=?", [projectId]) === "refunded", "投诉全额退款后项目未退款");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM settlements WHERE projectId=? AND status='frozen'", [projectId]) === 0, "投诉退款后结算残留 frozen");
    check(await scalar<string>(admin, "SELECT status value FROM settlements WHERE projectId=?", [projectId]) === "rejected", "投诉退款后结算状态不清晰");
    results.push("投诉退款后结算解冻");

    console.log(`MySQL V3.1.1 integration: ${results.length} groups passed`);
    for (const result of results) console.log(`  ✓ ${result}`);
  } finally {
    if (process.env.KEEP_INTEGRATION_DB !== "1") await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``);
    await admin.end();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  },
);
