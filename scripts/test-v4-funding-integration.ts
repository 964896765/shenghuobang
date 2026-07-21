import { spawn } from "node:child_process";

import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import {
  assertSafeLocalTestDatabaseServer,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlAdminUrlFromEnv,
} from "./lib/mysql-test-config.mjs";
import type { TrpcContext } from "../server/_core/context";

const DATABASE_NAME = "shenghuobang_v4_funding_integration";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`V4 新品筹措集成测试失败：${message}`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)));
  });
}

async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}

async function expectTrpcCode(action: () => Promise<unknown>, expectedCode: string, message: string) {
  try {
    await action();
  } catch (cause) {
    const actualCode = typeof cause === "object" && cause != null && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : null;
    check(actualCode === expectedCode, `${message}，预期 ${expectedCode}，实际 ${actualCode ?? "unknown"}`);
    return;
  }
  throw new Error(`V4 新品筹措集成测试失败：${message}，请求意外成功`);
}

async function main() {
  const { rawUrl: adminRawUrl } = resolveMysqlAdminUrlFromEnv({ consumerName: "v4 funding integration test" });
  assertSafeLocalTestDatabaseServer(adminRawUrl, { consumerName: "v4 funding integration test" });
  const admin = await mysql.createConnection(
    createMysqlConnectionOptions(adminRawUrl, { multipleStatements: true }),
  );
  const target = replaceMysqlDatabaseName(adminRawUrl, DATABASE_NAME);
  const results: string[] = [];
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await run(command, ["db:migrate"], { ...process.env, DATABASE_URL: target });
    await admin.query(`USE \`${DATABASE_NAME}\``);
    process.env.DATABASE_URL = target;

    const [ownerInsert] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name,accountStatus) VALUES ('v4-funding:owner','18800000701','integration','需求发起人','active')",
    );
    const [supporterInsert] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name,accountStatus) VALUES ('v4-funding:supporter','18800000702','integration','意向支持者','active')",
    );
    const [strangerInsert] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name,accountStatus) VALUES ('v4-funding:stranger','18800000703','integration','无关用户','active')",
    );
    const [needInsert] = await admin.execute<ResultSetHeader>(
      `INSERT INTO needs
        (creatorId,needType,title,originalDescription,structuredData,category,budgetMin,budgetMax,expectedDeadline,cityName,supportsRemote,status,supportCount,publishedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ownerInsert.insertId,
        "product",
        "需要更耐用且可追溯的社区净水杯",
        "希望验证真实需求后再决定是否进入新品生产。",
        JSON.stringify({ scene: "community", lifecycle: "traceable" }),
        "生活用品",
        0,
        0,
        "三个月内",
        "北京",
        1,
        "collecting_solutions",
        0,
        new Date(),
      ],
    );

    const db = await import("../server/db");
    const { appRouter } = await import("../server/routers");
    const owner = await db.getUserById(ownerInsert.insertId);
    const supporter = await db.getUserById(supporterInsert.insertId);
    const stranger = await db.getUserById(strangerInsert.insertId);
    check(owner && supporter && stranger, "测试账号创建失败");
    const ownerCaller = appRouter.createCaller({ user: owner, req: {}, res: {} } as TrpcContext);
    const supporterCaller = appRouter.createCaller({ user: supporter, req: {}, res: {} } as TrpcContext);
    const strangerCaller = appRouter.createCaller({ user: stranger, req: {}, res: {} } as TrpcContext);
    const publicCaller = appRouter.createCaller({ user: null, req: {}, res: {} } as TrpcContext);

    const createInput = {
      sourceType: "need" as const,
      sourceId: needInsert.insertId,
      title: "社区高可信净水杯新品意向",
      summary: "在进入生产前验证首批十件的真实使用意向",
      description: "本活动只统计非支付支持意向，不形成订单、投资、收益或交付承诺。",
      categoryCode: "home.water",
      goalQuantity: 10,
      evidence: [{
        type: "need" as const,
        title: "社区公开需求",
        summary: "来源需求由活动发起人创建，并作为新品筹措的可审计来源。",
      }],
      verificationSummary: "演示环境已核对来源所有权；未连接外部核验机构。",
      riskSummary: "当前只是需求与意向验证，产品规格、价格、生产和交付均未确定。",
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      requestId: "v4-funding-create-001",
    };
    const created = await ownerCaller.fundingCampaigns.create(createInput);
    check(created.campaign.status === "draft" && created.campaign.sourceType === "need", "筹措草稿或需求来源未创建");
    const duplicateCreate = await ownerCaller.fundingCampaigns.create(createInput);
    check(duplicateCreate.duplicate && duplicateCreate.campaign.id === created.campaign.id, "筹措创建请求未幂等返回原记录");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM funding_campaigns WHERE id=?", [created.campaign.id]) === 1, "筹措幂等重放产生重复活动");
    await expectTrpcCode(
      () => strangerCaller.fundingCampaigns.create({ ...createInput, requestId: "v4-funding-create-forbidden-001" }),
      "FORBIDDEN",
      "无关用户可从他人需求发起筹措",
    );
    results.push("需求来源所有权、活动创建与请求幂等");

    const published = await ownerCaller.fundingCampaigns.publish({
      campaignId: created.campaign.id,
      expectedAuthorizationVersion: created.campaign.authorizationVersion,
      requestId: "v4-funding-publish-001",
    });
    check(published.campaign.status === "active" && published.campaign.visibility === "public", "筹措活动未进入公开进行中状态");
    await expectTrpcCode(
      () => strangerCaller.fundingCampaigns.update({
        campaignId: created.campaign.id,
        summary: "越权修改",
        requestId: "v4-funding-update-forbidden-001",
      }),
      "FORBIDDEN",
      "无关用户可修改他人筹措活动",
    );
    results.push("服务端所有者授权、越权拒绝与公开状态机");

    const publicList = await publicCaller.fundingCampaigns.publicList({ categoryCode: "home.water", limit: 10 });
    check(publicList.items.some((item) => item.publicCode === created.campaign.publicCode), "公开筹措列表未返回已发布活动");
    const publicDetail = await publicCaller.fundingCampaigns.publicDetail({ publicCode: created.campaign.publicCode });
    const publicPayload = JSON.stringify(publicDetail);
    for (const forbiddenField of ["ownerAccountId", "sourceId", "authorizationVersion", "createdRequestId", "lastRequestId"]) {
      check(!publicPayload.includes(forbiddenField), `公开筹措详情泄露内部字段 ${forbiddenField}`);
    }
    const initialTimeline = await publicCaller.fundingCampaigns.publicTimeline({ publicCode: created.campaign.publicCode });
    check(initialTimeline.some((event) => event.eventType === "campaign_created") && initialTimeline.some((event) => event.eventType === "campaign_published"), "公开时间线缺少创建或发布事件");
    results.push("公开列表、详情、追加时间线与内部字段脱敏");

    console.log("[funding-integration] validating self-pledge rejection");
    await expectTrpcCode(
      () => ownerCaller.fundingPledges.register({
        publicCode: created.campaign.publicCode,
        quantity: 1,
        requestId: "v4-funding-self-pledge-001",
      }),
      "FORBIDDEN",
      "活动所有者可支持自己的筹措",
    );
    const pledgeInput = {
      publicCode: created.campaign.publicCode,
      quantity: 3,
      note: "愿意参与首批真实体验",
      cityName: "北京",
      requestId: "v4-funding-pledge-001",
    };
    console.log("[funding-integration] registering first supporter intent");
    const pledged = await supporterCaller.fundingPledges.register(pledgeInput);
    check(pledged.pledge.status === "active" && pledged.campaign.pledgedQuantity === 3, "支持意向或活动进度未在同一事务中更新");
    const pledgePayload = JSON.stringify(pledged.campaign);
    check(!pledgePayload.includes("ownerAccountId") && !pledgePayload.includes("sourceId") && !pledgePayload.includes("authorizationVersion"), "支持意向响应泄露活动内部字段");
    const duplicatePledge = await supporterCaller.fundingPledges.register(pledgeInput);
    check(duplicatePledge.duplicate && duplicatePledge.pledge.id === pledged.pledge.id, "支持意向请求未幂等返回原记录");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM funding_pledges WHERE campaignId=?", [created.campaign.id]) === 1, "支持意向幂等重放产生重复记录");
    results.push("非支付支持意向、自支持拒绝、事务聚合与响应脱敏");

    const ownerPledges = await ownerCaller.fundingPledges.campaignList({ campaignId: created.campaign.id });
    check(ownerPledges.length === 1 && ownerPledges[0]?.quantity === 3, "活动所有者无法查看最小披露的支持意向");
    check(!JSON.stringify(ownerPledges).includes("supporterAccountId"), "活动所有者支持者列表泄露内部账号主键");
    await expectTrpcCode(
      () => strangerCaller.fundingPledges.campaignList({ campaignId: created.campaign.id }),
      "FORBIDDEN",
      "无关用户可查看活动支持者列表",
    );
    const myPledges = await supporterCaller.fundingPledges.myList();
    check(myPledges.length === 1 && myPledges[0]?.campaignPublicCode === created.campaign.publicCode, "支持者的本人意向列表未返回真实记录");
    results.push("支持者本人数据范围、活动所有者最小披露与无关用户拒绝");

    console.log("[funding-integration] withdrawing supporter intent");
    const withdrawn = await supporterCaller.fundingPledges.withdraw({
      pledgeId: pledged.pledge.id,
      requestId: "v4-funding-withdraw-001",
    });
    check(withdrawn.pledge.status === "withdrawn", "支持意向未撤回");
    const afterWithdraw = await publicCaller.fundingCampaigns.publicDetail({ publicCode: created.campaign.publicCode });
    check(afterWithdraw.pledgedQuantity === 0 && afterWithdraw.activePledgeCount === 0, "撤回后公开进度未按真值重算");
    console.log("[funding-integration] registering goal-reaching intent");
    const goalPledge = await supporterCaller.fundingPledges.register({
      publicCode: created.campaign.publicCode,
      quantity: 10,
      note: "重新确认十件意向以验证达标终态",
      requestId: "v4-funding-pledge-goal-001",
    });
    check(goalPledge.campaign.pledgedQuantity === 10, "重新登记后筹措数量未达到目标");
    console.log("[funding-integration] closing reached campaign as succeeded");
    const succeeded = await ownerCaller.fundingCampaigns.close({
      campaignId: created.campaign.id,
      targetStatus: "succeeded",
      reason: "非支付意向数量已达到演示目标",
      requestId: "v4-funding-close-success-001",
    });
    check(succeeded.campaign.status === "succeeded", "达标活动未进入成功终态");
    console.log("[funding-integration] validating terminal campaign rejection");
    await expectTrpcCode(
      () => strangerCaller.fundingPledges.register({
        publicCode: created.campaign.publicCode,
        quantity: 1,
        requestId: "v4-funding-pledge-after-close-001",
      }),
      "BAD_REQUEST",
      "终态活动仍可登记支持意向",
    );
    results.push("撤回重算、再次支持、目标达成与不可逆终态");

    const [eventRows] = await admin.execute<(RowDataPacket & { sequenceNumber: number; eventType: string })[]>(
      "SELECT sequenceNumber,eventType FROM funding_campaign_events WHERE campaignId=? ORDER BY sequenceNumber",
      [created.campaign.id],
    );
    check(eventRows.length >= 6, "筹措追加事件未完整持久化");
    eventRows.forEach((event, index) => check(event.sequenceNumber === index + 1, `筹措事件序号在第 ${index + 1} 项不连续`));
    check(await scalar<number>(admin, "SELECT pledgedQuantity value FROM funding_campaigns WHERE id=?", [created.campaign.id]) === 10, "MySQL 活动聚合数量与有效意向不一致");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM funding_pledges WHERE campaignId=? AND status='active'", [created.campaign.id]) === 1, "MySQL 有效支持意向计数错误");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM audit_logs WHERE action IN ('funding.campaign.create','funding.campaign.publish','funding.campaign.edit','funding.pledge.register','funding.pledge.withdraw','funding.campaign.close')") >= 8, "筹措高风险允许或拒绝审计记录不足");
    results.push("真实 MySQL 聚合真值、追加事件序列与高风险审计");

    console.log(`V4 funding MySQL integration passed: ${results.length} groups`);
    results.forEach((result) => console.log(`  ✓ ${result}`));
  } finally {
    if (process.env.KEEP_INTEGRATION_DB !== "1") {
      await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    }
    await admin.end();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
