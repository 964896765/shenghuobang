import "dotenv/config";
import path from "node:path";
import { spawn } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import {
  assertSafeLocalTestDatabaseServer,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlAdminUrlFromEnv,
} from "./lib/mysql-test-config.mjs";
import type { PaymentProvider, ProviderPaymentRequest, ProviderPaymentResult, ProviderRefundRequest, ProviderRefundResult } from "../server/payments/provider";

const DATABASE_NAME = "shenghuobang_v312_integration";
const ACTIVE_STATUSES = "'submitted','waiting_response','under_review','waiting_evidence','negotiating','decision_pending'";

class RetrySandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  private refundCalls = 0;

  async confirmPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    return { success: true, providerTransactionNo: `V312-PAY-${request.paymentNo}`, raw: { integration: true } };
  }

  async queryPayment(providerTransactionNo: string): Promise<ProviderPaymentResult> {
    return { success: true, providerTransactionNo, raw: { integration: true } };
  }

  async refund(request: ProviderRefundRequest): Promise<ProviderRefundResult> {
    this.refundCalls += 1;
    if (this.refundCalls === 1) return { success: false, failedReason: "V312_RETRYABLE_FAILURE", raw: { call: 1, retryable: true } };
    return { success: true, providerRefundNo: `V312-REF-${request.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "-")}`, raw: { call: this.refundCalls, retryable: false } };
  }
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`V3.1.2 集成测试失败：${message}`);
}

async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}

async function applyMigration(connection: mysql.Connection, file: string) {
  const migration = (await readFile(path.resolve(process.cwd(), "drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", "");
  await connection.query(migration);
}

async function applyMigrationsAfter(connection: mysql.Connection, afterPrefix: string) {
  const files = (await readdir(path.resolve(process.cwd(), "drizzle")))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .filter((file) => file > afterPrefix);
  for (const file of files) {
    await applyMigration(connection, file);
  }
}

async function checkUnavailableReadiness() {
  const port = 31472;
  const tsxCli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, path.resolve(process.cwd(), "server", "_core", "index.ts")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      JWT_SECRET: "v312-readiness-integration-secret",
      FILE_SIGNING_SECRET: "v312-readiness-file-signing-secret",
      CORS_ORIGINS: "http://localhost:8081",
      DATABASE_URL: "mysql://root@127.0.0.1:1/unavailable",
      PAYMENT_PROVIDER: "sandbox",
      STORAGE_PROVIDER: "local",
      LOCAL_UPLOAD_DIR: path.resolve(process.cwd(), ".tmp-v312-readiness"),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  try {
    let healthStatus = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        healthStatus = (await fetch(`http://127.0.0.1:${port}/api/health`)).status;
        if (healthStatus === 200) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (healthStatus !== 200) return;
    const ready = await fetch(`http://127.0.0.1:${port}/api/ready`);
    const body = await ready.json() as { ok?: boolean; checks?: { database?: string } };
    check(ready.status !== 200 && body.ok === false && body.checks?.database === "failed", "数据库不可用时 /api/ready 未返回非 200");
  } finally {
    child.kill();
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    await rm(path.resolve(process.cwd(), ".tmp-v312-readiness"), { recursive: true, force: true });
  }
}

async function main() {
  const { rawUrl: adminRawUrl } = resolveMysqlAdminUrlFromEnv({ consumerName: "v3.1.2 integration test" });
  assertSafeLocalTestDatabaseServer(adminRawUrl, { consumerName: "v3.1.2 integration test" });
  const admin = await mysql.createConnection(
    createMysqlConnectionOptions(adminRawUrl, { multipleStatements: true }),
  );
  const testUrl = replaceMysqlDatabaseName(adminRawUrl, DATABASE_NAME);
  const results: string[] = [];

  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${DATABASE_NAME}\`;`);
    for (const file of [
      "0000_elite_eternals.sql", "0001_neat_omega_flight.sql", "0002_bizarre_rachel_grey.sql",
      "0003_spotty_captain_flint.sql", "0004_yummy_storm.sql", "0005_silky_squadron_supreme.sql",
    ]) await applyMigration(admin, file);

    const [historicalOwner] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v312:history-owner", "18800000201", "integration", "历史甲方"]);
    const [historicalEngineer] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v312:history-engineer", "18800000202", "integration", "历史工程师"]);
    const [historicalProject] = await admin.execute<ResultSetHeader>(
      "INSERT INTO projects (needId,quoteId,ownerId,engineerId,title,totalAmount,status) VALUES (?,?,?,?,?,100,'disputed')",
      [8001, 8001, historicalOwner.insertId, historicalEngineer.insertId, "历史重复投诉项目"],
    );
    await admin.execute(
      "INSERT INTO complaints (complainantId,respondentId,relatedType,relatedId,complaintType,description,status,createdAt) VALUES (?,?,?,?,?,?,?,NOW()),(?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 1 SECOND)),(?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 2 SECOND))",
      [
        historicalOwner.insertId, historicalEngineer.insertId, "project", historicalProject.insertId, "history", "保留投诉", "under_review",
        historicalOwner.insertId, historicalEngineer.insertId, "project", historicalProject.insertId, "history", "重复投诉一", "waiting_response",
        historicalOwner.insertId, historicalEngineer.insertId, "project", historicalProject.insertId, "history", "重复投诉二", "submitted",
      ],
    );
    const [historicalOrder] = await admin.execute<ResultSetHeader>(
      "INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status) VALUES ('project',?,?,?,?,100,'refunding')",
      [historicalOwner.insertId, historicalEngineer.insertId, historicalProject.insertId, "历史部分退款订单"],
    );
    const [historicalPayment] = await admin.execute<ResultSetHeader>(
      "INSERT INTO payments (paymentNo,orderId,payerId,amount,provider,providerTransactionNo,status,idempotencyKey,paidAt) VALUES (?,?,?,100,'sandbox','V311-HISTORICAL-PAY','partially_refunded','v311-historical-payment',NOW())",
      [`PAY-V311-HISTORICAL-${historicalOrder.insertId}`, historicalOrder.insertId, historicalOwner.insertId],
    );
    await admin.execute(
      "INSERT INTO refunds (refundNo,paymentId,orderId,requesterId,amount,reason,status,idempotencyKey,providerRefundNo,completedAt) VALUES (?,?,?,?,40,'历史部分退款','success','v311-historical-refund','V311-HISTORICAL-REFUND',NOW())",
      [`REF-V311-HISTORICAL-${historicalOrder.insertId}`, historicalPayment.insertId, historicalOrder.insertId, historicalOwner.insertId],
    );
    await applyMigration(admin, "0006_steady_wild_child.sql");
    check(await scalar<number>(admin, `SELECT COUNT(*) value FROM complaints WHERE relatedType='project' AND relatedId=? AND status IN (${ACTIVE_STATUSES})`, [historicalProject.insertId]) === 1, "历史重复活动投诉未收敛为一条");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM complaint_active_locks WHERE projectId=?", [historicalProject.insertId]) === 1, "保留投诉没有活动锁");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM complaint_status_logs WHERE complaintId IN (SELECT id FROM complaints WHERE relatedId=? AND status='closed') AND toStatus='closed'", [historicalProject.insertId]) === 2, "重复投诉关闭状态日志缺失");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM complaint_actions WHERE complaintId IN (SELECT id FROM complaints WHERE relatedId=? AND status='closed') AND actorType='system'", [historicalProject.insertId]) === 2, "重复投诉系统动作缺失");
    check(await scalar<number>(admin, `SELECT COUNT(*) value FROM complaints c LEFT JOIN complaint_active_locks l ON l.complaintId=c.id WHERE c.status IN (${ACTIVE_STATUSES}) AND l.id IS NULL`) === 0, "仍存在活动状态但无活动锁的投诉");
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [historicalOrder.insertId]) === "partially_refunded", "V3.1.1 历史部分退款订单未升级");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM order_status_logs WHERE orderId=? AND fromStatus='refunding' AND toStatus='partially_refunded'", [historicalOrder.insertId]) === 1, "历史部分退款订单升级日志缺失");
    results.push("历史重复活动投诉升级处理");

    await applyMigrationsAfter(admin, "0006_steady_wild_child.sql");

    process.env.DATABASE_URL = testUrl;
    process.env.PAYMENT_PROVIDER = "sandbox";
    const finance = await import("../server/services/finance-service");
    const complaint = await import("../server/services/complaint-service");

    const [owner] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v312:owner", "18800000211", "integration", "V312 甲方"]);
    const [engineer] = await admin.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES (?,?,?,?)", ["v312:engineer", "18800000212", "integration", "V312 工程师"]);
    const ownerId = owner.insertId;
    const engineerId = engineer.insertId;
    let sequence = 0;

    const createOrderAndPay = async (projectId: number, label: string, amount = 100) => {
      sequence += 1;
      const [order] = await admin.execute<ResultSetHeader>(
        "INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status) VALUES ('project',?,?,?,?,?,'pending_payment')",
        [ownerId, engineerId, projectId, label, amount],
      );
      const payment = await finance.createPayment({ orderId: order.insertId, payerId: ownerId, amount: `${amount}.00`, idempotencyKey: `v312-pay-${sequence}` });
      await finance.confirmPayment({ paymentId: payment.id, payerId: ownerId, idempotencyKey: `v312-confirm-${sequence}` });
      return { orderId: order.insertId, paymentId: payment.id };
    };

    const createProjectFixture = async (label: string, escrowCount = 1) => {
      sequence += 1;
      const [project] = await admin.execute<ResultSetHeader>(
        "INSERT INTO projects (needId,quoteId,ownerId,engineerId,title,totalAmount,status) VALUES (?,?,?,?,?,?,'pending_payment')",
        [9000 + sequence, 9000 + sequence, ownerId, engineerId, label, 100 * escrowCount],
      );
      const [milestone] = await admin.execute<ResultSetHeader>(
        "INSERT INTO milestones (projectId,title,amount,sortOrder,status) VALUES (?,?,?,1,'pending')",
        [project.insertId, `${label}里程碑`, 100 * escrowCount],
      );
      const finances: { orderId: number; paymentId: number }[] = [];
      for (let index = 0; index < escrowCount; index += 1) finances.push(await createOrderAndPay(project.insertId, `${label}订单${index + 1}`));
      await admin.execute("UPDATE milestones SET status='waiting_acceptance' WHERE id=?", [milestone.insertId]);
      await admin.execute(
        "INSERT INTO settlements (settlementNo,projectId,milestoneId,payeeId,amount,status,idempotencyKey) VALUES (?,?,?,?,?,'pending',?)",
        [`V312-SET-${project.insertId}`, project.insertId, milestone.insertId, engineerId, 100 * escrowCount, `v312-settlement-${project.insertId}`],
      );
      return { projectId: project.insertId, milestoneId: milestone.insertId, finances };
    };

    const full = await createProjectFixture("全额退款");
    const fullComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: full.milestoneId, complaintType: "refund", description: "全额退款里程碑终态" });
    await complaint.decideComplaint({ complaintId: fullComplaint.complaintId, operatorId: engineerId, result: "full_refund", reason: "V312 全额退款" });
    check(await scalar<string>(admin, "SELECT status value FROM milestones WHERE id=?", [full.milestoneId]) === "cancelled", "full_refund 后里程碑仍 disputed");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND status='frozen'", [full.projectId]) === 0, "full_refund 后托管仍 frozen");
    results.push("full_refund 后里程碑不再 disputed");

    const partialContinue = await createProjectFixture("部分退款继续履约");
    const continueComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: partialContinue.milestoneId, complaintType: "refund", description: "部分退款后继续" });
    await complaint.decideComplaint({ complaintId: continueComplaint.complaintId, operatorId: engineerId, result: "partial_refund", refundAmount: 40, continuePerformance: true, reason: "部分退款继续履约" });
    check(await scalar<string>(admin, "SELECT status value FROM projects WHERE id=?", [partialContinue.projectId]) === "in_progress", "部分退款继续履约项目状态错误");
    check(await scalar<string>(admin, "SELECT status value FROM milestones WHERE id=?", [partialContinue.milestoneId]) === "waiting_acceptance", "部分退款继续履约未恢复里程碑快照");
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [partialContinue.finances[0].orderId]) === "partially_refunded", "部分退款成功后订单仍是 refunding");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM order_status_logs WHERE orderId=? AND toStatus='partially_refunded'", [partialContinue.finances[0].orderId]) === 1, "部分退款订单状态日志缺失");
    results.push("partial_refund 继续履约状态一致");

    const partialStop = await createProjectFixture("部分退款停止履约");
    const stopComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: partialStop.milestoneId, complaintType: "refund", description: "部分退款后停止" });
    await complaint.decideComplaint({ complaintId: stopComplaint.complaintId, operatorId: engineerId, result: "partial_refund", refundAmount: 40, continuePerformance: false, reason: "部分退款停止履约" });
    check(await scalar<string>(admin, "SELECT status value FROM projects WHERE id=?", [partialStop.projectId]) === "paused", "部分退款停止履约项目未暂停");
    check(await scalar<string>(admin, "SELECT status value FROM milestones WHERE id=?", [partialStop.milestoneId]) === "cancelled", "部分退款停止履约里程碑未取消");
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [partialStop.finances[0].orderId]) === "partially_refunded", "停止履约的部分退款订单状态错误");
    results.push("partial_refund 停止履约状态一致");

    const partialRelease = await createProjectFixture("部分释放继续履约");
    const releaseComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: partialRelease.milestoneId, complaintType: "release", description: "部分释放后继续" });
    await complaint.decideComplaint({ complaintId: releaseComplaint.complaintId, operatorId: engineerId, result: "partial_release", releaseAmount: 40, reason: "部分释放继续履约" });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM projects WHERE id=? AND status='disputed'", [partialRelease.projectId]) === 0, "partial_release 后项目仍 disputed");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM milestones WHERE projectId=? AND status='disputed'", [partialRelease.projectId]) === 0, "partial_release 后里程碑仍 disputed");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND status='frozen'", [partialRelease.projectId]) === 0, "partial_release 后托管仍 frozen");
    check(await scalar<string>(admin, "SELECT status value FROM escrow_records WHERE projectId=?", [partialRelease.projectId]) === "partially_released", "partial_release 后托管状态未保留为 partially_released");
    results.push("partial_release 后无 disputed/frozen 残留");

    const validation = await createProjectFixture("正金额校验");
    await finance.submitRefund({ paymentId: validation.finances[0].paymentId, requesterId: ownerId, amount: 0, reason: "零元退款必须拒绝", idempotencyKey: "v312-zero-refund" }).then(
      () => { throw new Error("零元退款被错误接受"); },
      () => undefined,
    );
    await finance.submitRefund({ paymentId: validation.finances[0].paymentId, requesterId: ownerId, amount: -1, reason: "负数退款必须拒绝", idempotencyKey: "v312-negative-refund" }).then(
      () => { throw new Error("负数退款被错误接受"); },
      () => undefined,
    );
    results.push("0 元和负数退款被拒绝");

    const retry = await createProjectFixture("失败退款安全重试");
    const retryRefund = await finance.submitRefund({ paymentId: retry.finances[0].paymentId, requesterId: ownerId, amount: 40, reason: "失败后安全重试", idempotencyKey: "v312-retry-refund" });
    await finance.approveRefund(retryRefund.id, engineerId, "批准重试测试");
    const retryProvider = new RetrySandboxProvider();
    await finance.executeApprovedRefund(retryRefund.id, engineerId, retryProvider).then(
      () => { throw new Error("首次退款预期失败却成功"); },
      () => undefined,
    );
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [retry.finances[0].orderId]) === "pending_delivery", "退款失败后订单未恢复履约状态");
    await finance.retryFailedRefund(retryRefund.id, engineerId, retryProvider);
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM refund_attempts WHERE refundId=?", [retryRefund.id]) === 2, "退款重试未保留两次尝试");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM refund_attempts WHERE refundId=? AND status='failed'", [retryRefund.id]) === 1, "失败尝试记录缺失");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM refund_attempts WHERE refundId=? AND status='success'", [retryRefund.id]) === 1, "成功重试记录缺失");
    check(await scalar<string>(admin, "SELECT status value FROM orders WHERE id=?", [retry.finances[0].orderId]) === "partially_refunded", "重试成功后订单状态错误");

    const complaintRetry = await createProjectFixture("投诉裁定退款重试");
    const retryComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: complaintRetry.milestoneId, complaintType: "refund", description: "裁定退款失败后重试" });
    const complaintRetryProvider = new RetrySandboxProvider();
    await complaint.decideComplaint({ complaintId: retryComplaint.complaintId, operatorId: engineerId, result: "partial_refund", refundAmount: 40, continuePerformance: true, reason: "裁定退款重试", paymentProvider: complaintRetryProvider }).then(
      () => { throw new Error("投诉裁定首次退款预期失败却成功"); },
      () => undefined,
    );
    await complaint.decideComplaint({ complaintId: retryComplaint.complaintId, operatorId: engineerId, result: "partial_refund", refundAmount: 40, continuePerformance: true, reason: "裁定退款重试", paymentProvider: complaintRetryProvider });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM refund_attempts WHERE refundId IN (SELECT id FROM refunds WHERE orderId=?)", [complaintRetry.finances[0].orderId]) === 2, "投诉裁定退款失败后未创建安全重试尝试");
    check(await scalar<string>(admin, "SELECT status value FROM complaints WHERE id=?", [retryComplaint.complaintId]) === "resolved", "投诉裁定退款重试后未解决");
    results.push("退款失败后可以安全重试");

    await checkUnavailableReadiness();
    results.push("数据库不可用时 /api/ready 非 200");

    const multiple = await createProjectFixture("多托管裁定", 2);
    const multipleComplaint = await complaint.createComplaintAndFreeze({ complainantId: ownerId, relatedType: "milestone", relatedId: multiple.milestoneId, complaintType: "release", description: "多托管记录全部处理" });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND status='frozen'", [multiple.projectId]) === 2, "多托管投诉未冻结全部托管");
    await complaint.decideComplaint({ complaintId: multipleComplaint.complaintId, operatorId: engineerId, result: "partial_release", releaseAmount: 150, reason: "多托管部分释放" });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND status='frozen'", [multiple.projectId]) === 0, "多托管裁定后仍有 frozen");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND releasedAmount > 0", [multiple.projectId]) === 2, "多托管裁定没有遍历全部托管");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_records WHERE projectId=? AND status IN ('released','partially_released')", [multiple.projectId]) === 2, "多托管释放状态被错误恢复");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM escrow_releases WHERE escrowId IN (SELECT id FROM escrow_records WHERE projectId=?)", [multiple.projectId]) === 2, "多托管释放记录不完整");
    results.push("多托管投诉裁定全部恢复或终结");

    console.log(`MySQL V3.1.2 integration: ${results.length} groups passed`);
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
