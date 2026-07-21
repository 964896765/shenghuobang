import { spawn } from "node:child_process";

import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import {
  assertSafeLocalTestDatabaseServer,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlAdminUrlFromEnv,
} from "./lib/mysql-test-config.mjs";
import type { TrpcContext } from "../server/_core/context";

const DATABASE_NAME = "shenghuobang_v4_product_integration";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`V4 产品核心集成测试失败：${message}`);
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
  throw new Error(`V4 产品核心集成测试失败：${message}，请求意外成功`);
}

async function main() {
  const { rawUrl: adminRawUrl } = resolveMysqlAdminUrlFromEnv({ consumerName: "v4 product core integration test" });
  assertSafeLocalTestDatabaseServer(adminRawUrl, { consumerName: "v4 product core integration test" });
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
      "INSERT INTO users (openId,phone,passwordHash,name,accountStatus) VALUES ('v4-product:owner','18800000601','integration','产品所有者','active')",
    );
    const [strangerInsert] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name,accountStatus) VALUES ('v4-product:stranger','18800000602','integration','无关用户','active')",
    );
    const [itemInsert] = await admin.execute<ResultSetHeader>(
      "INSERT INTO items (ownerId,title,status) VALUES (?,?,'idle')",
      [ownerInsert.insertId, "可追溯演示净水杯"],
    );

    const db = await import("../server/db");
    const { appRouter } = await import("../server/routers");
    const owner = await db.getUserById(ownerInsert.insertId);
    const stranger = await db.getUserById(strangerInsert.insertId);
    check(owner && stranger, "测试账号创建失败");
    const ownerCaller = appRouter.createCaller({ user: owner, req: {}, res: {} } as TrpcContext);
    const strangerCaller = appRouter.createCaller({ user: stranger, req: {}, res: {} } as TrpcContext);
    const publicCaller = appRouter.createCaller({ user: null, req: {}, res: {} } as TrpcContext);

    const createInput = {
      name: "高可信演示净水杯",
      summary: "从现有物品档案升级而来的可追溯产品型号",
      description: "用于验证产品型号、单件身份、护照事件与公开追溯。",
      categoryCode: "home.water",
      brandName: "生活帮演示",
      modelCode: "SHB-WATER-001",
      versionLabel: "v1",
      specifications: { capacityMl: 500, filterGrade: "demo" },
      visibility: "public" as const,
      sourceLinks: [{ sourceType: "legacy_item" as const, sourceId: itemInsert.insertId, relationType: "migrated_from" as const }],
      requestId: "v4-product-model-create-001",
    };
    const created = await ownerCaller.productModels.create(createInput);
    check(created.model.status === "draft" && created.sourceLinks.length === 1, "型号草稿或来源关系未创建");
    const duplicateModel = await ownerCaller.productModels.create(createInput);
    check(duplicateModel.duplicate && duplicateModel.model.id === created.model.id, "型号创建请求未幂等返回原记录");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM product_models WHERE id=?", [created.model.id]) === 1, "幂等重放产生重复型号");
    results.push("型号创建、来源关系与请求幂等");

    await expectTrpcCode(
      () => strangerCaller.productModels.update({
        productModelId: created.model.id,
        summary: "越权修改",
        expectedAuthorizationVersion: created.model.authorizationVersion,
        requestId: "v4-product-model-forbidden-001",
      }),
      "FORBIDDEN",
      "无关账号可修改他人型号",
    );
    const published = await ownerCaller.productModels.publish({
      productModelId: created.model.id,
      expectedAuthorizationVersion: created.model.authorizationVersion,
      requestId: "v4-product-model-publish-001",
    });
    check(published.model.status === "active" && published.model.authorizationVersion === 2, "型号发布未完成受控状态迁移");
    results.push("服务端所有者授权、越权拒绝与型号发布状态机");

    const publicModels = await publicCaller.productModels.publicList({ categoryCode: "home.water", limit: 10 });
    check(publicModels.items.some((item) => item.publicCode === created.model.publicCode), "公开型号列表未返回已发布型号");
    const publicModel = await publicCaller.productModels.publicDetail({ publicCode: created.model.publicCode });
    const publicModelPayload = JSON.stringify(publicModel);
    check(!publicModelPayload.includes("ownerAccountId") && !publicModelPayload.includes("ownerOrganizationId"), "公开型号泄露所有者内部字段");
    check(publicModel.sourceLinks.length === 0, "公开型号泄露非公开 legacy_item 来源");
    results.push("公开型号读取与来源/所有者字段脱敏");

    const registerInput = {
      productModelId: created.model.id,
      linkedItemId: itemInsert.insertId,
      serialNumber: "DEMO-SERIAL-0001",
      batchCode: "DEMO-BATCH-202607",
      initialStatus: "manufactured" as const,
      trustLevel: "verified" as const,
      passportVisibility: "public" as const,
      manufacturedAt: new Date("2026-07-21T02:00:00.000Z"),
      detail: { evidence: "integration-fixture" },
      requestId: "v4-product-unit-register-001",
    };
    const registered = await ownerCaller.productUnits.register(registerInput);
    check(registered.unit.status === "manufactured" && registered.event?.sequenceNumber === 1, "产品单元或初始护照事件未创建");
    const duplicateUnit = await ownerCaller.productUnits.register(registerInput);
    check(duplicateUnit.duplicate && duplicateUnit.unit.id === registered.unit.id, "产品单元注册未幂等返回原记录");
    await expectTrpcCode(
      () => ownerCaller.productUnits.register({
        ...registerInput,
        serialNumber: "DEMO-SERIAL-0002",
        requestId: "v4-product-unit-register-conflict-001",
      }),
      "CONFLICT",
      "同一物品可绑定多个产品单元",
    );
    results.push("单件产品身份、物品一对一绑定与注册幂等");

    const activated = await ownerCaller.productUnits.transition({
      productUnitId: registered.unit.id,
      toStatus: "in_use",
      visibility: "public",
      detail: { scene: "first_activation" },
      occurredAt: new Date("2026-07-21T03:00:00.000Z"),
      expectedAuthorizationVersion: registered.unit.authorizationVersion,
      requestId: "v4-product-unit-activate-001",
    });
    check(activated.unit.status === "in_use" && activated.event?.sequenceNumber === 2, "产品单元激活状态或护照序列错误");
    const verified = await ownerCaller.productUnits.appendPassport({
      productUnitId: registered.unit.id,
      eventType: "quality_verified",
      visibility: "public",
      sourceType: "verification",
      sourceId: "demo-inspection-001",
      detail: { score: 96, providerMode: "sandbox" },
      occurredAt: new Date("2026-07-21T04:00:00.000Z"),
      expectedAuthorizationVersion: activated.unit.authorizationVersion,
      requestId: "v4-product-passport-public-001",
    });
    check(verified.event.sequenceNumber === 3 && verified.event.previousEventHash === activated.event?.eventHash, "公开护照事件未正确连接前序哈希");
    const internal = await ownerCaller.productUnits.appendPassport({
      productUnitId: registered.unit.id,
      eventType: "internal_quality_note",
      visibility: "internal",
      sourceType: "internal_check",
      sourceId: "internal-001",
      detail: { note: "不得出现在公开护照" },
      expectedAuthorizationVersion: verified.unit.authorizationVersion,
      requestId: "v4-product-passport-internal-001",
    });
    check(internal.event.sequenceNumber === 4, "内部护照事件序列错误");
    results.push("产品状态迁移、追加式护照事件与 SHA-256 哈希链");

    await expectTrpcCode(
      () => strangerCaller.productUnits.detail({ productUnitId: registered.unit.id }),
      "FORBIDDEN",
      "无关账号可查看所有者产品单元详情",
    );
    const publicUnit = await publicCaller.productUnits.publicPassport({ publicCode: registered.unit.publicCode });
    const publicUnitPayload = JSON.stringify(publicUnit);
    check(publicUnit.events.length === 3 && publicUnit.events.every((event) => event.eventType !== "internal_quality_note"), "公开护照包含内部事件或事件数量错误");
    check(publicUnit.integrity.verified && publicUnit.integrity.visibleEventCount === publicUnit.events.length, "公开护照未返回可信的哈希链完整性结果");
    for (const forbiddenField of ["ownerAccountId", "linkedItemId", "serialNumber", "actorAccountId", "requestId", "internal-001"]) {
      check(!publicUnitPayload.includes(forbiddenField), `公开护照泄露字段或值 ${forbiddenField}`);
    }
    const ownerUnit = await ownerCaller.productUnits.detail({ productUnitId: registered.unit.id });
    check(ownerUnit.integrity.verified && ownerUnit.events.length === 3, "本人护照未正确过滤内部事件或返回完整性结果");
    const internalUnit = await ownerCaller.productUnits.internalDetail({ productUnitId: registered.unit.id });
    check(internalUnit.integrity.verified && internalUnit.events.length === 4 && internalUnit.events.some((event) => event.eventType === "internal_quality_note"), "内部护照未返回完整追溯事件");
    await expectTrpcCode(
      () => strangerCaller.productUnits.internalDetail({ productUnitId: registered.unit.id }),
      "FORBIDDEN",
      "无关账号可查看产品内部护照",
    );
    results.push("产品单元三类护照视图、完整性校验与最小披露");

    const [hashRows] = await admin.execute<(RowDataPacket & { sequenceNumber: number; previousEventHash: string | null; eventHash: string })[]>(
      "SELECT sequenceNumber,previousEventHash,eventHash FROM product_passport_events WHERE productUnitId=? ORDER BY sequenceNumber",
      [registered.unit.id],
    );
    check(hashRows.length === 4, "护照事件未完整持久化到 MySQL");
    for (let index = 0; index < hashRows.length; index += 1) {
      check(hashRows[index].eventHash.length === 64, `第 ${index + 1} 个事件哈希长度错误`);
      check(index === 0 ? hashRows[index].previousEventHash == null : hashRows[index].previousEventHash === hashRows[index - 1].eventHash, `第 ${index + 1} 个事件前序哈希断链`);
    }
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM product_source_links WHERE productModelId=?", [created.model.id]) === 1, "产品来源关系未持久化");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM audit_logs WHERE actorId=? AND action IN ('product.model.create','product.model.publish','product.unit.register','product.unit.transition','product.passport.append')", [owner.id]) >= 6, "产品高风险动作审计记录不足");
    results.push("真实 MySQL 持久化、哈希连续性与高风险动作审计");

    console.log(`V4 product core MySQL integration passed: ${results.length} groups`);
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
