import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  assertSafeLocalTestDatabaseServer,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlAdminUrlFromEnv,
} from "./lib/mysql-test-config.mjs";

const DATABASE_NAME = "shenghuobang_v4_runnable_demo";

async function scalar(connection: mysql.Connection, sql: string) {
  const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

async function main() {
  const { rawUrl: adminRawUrl } = resolveMysqlAdminUrlFromEnv({ consumerName: "V4 runnable integration" });
  assertSafeLocalTestDatabaseServer(adminRawUrl, { consumerName: "V4 runnable integration" });
  const admin = await mysql.createConnection(createMysqlConnectionOptions(adminRawUrl, { multipleStatements: true }));
  const targetUrl = replaceMysqlDatabaseName(adminRawUrl, DATABASE_NAME);
  let connection: mysql.Connection | null = null;
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    connection = await mysql.createConnection(targetUrl);
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const env = { ...process.env, DATABASE_URL: targetUrl, ALLOW_DEMO_SEED: "true" };
    run(command, ["db:migrate"], env);
    run(command, ["db:seed"], env);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM product_models WHERE publicCode LIKE 'DEMO-%' AND status='active' AND visibility='public'"), 3);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM product_units WHERE publicCode LIKE 'DEMO-UNIT-%'"), 2);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM listing_skus WHERE createdRequestId LIKE 'seed-sku-create-%'"), 4);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM content_posts WHERE publicCode LIKE 'DEMO-CONTENT-%' AND status='published'"), 7);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM content_relations cr JOIN content_posts cp ON cp.id=cr.postId WHERE cp.publicCode LIKE 'DEMO-CONTENT-%' AND cr.relationType IN ('product','repair')"), 5);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM payments WHERE paymentNo='PAY-DEMO-COMMERCE-001' AND provider='sandbox' AND status='success'"), 1);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM reviews r JOIN credit_events c ON c.refId=r.id AND c.refType='review' WHERE r.requestId='seed-order-review-1' AND c.requestId='credit:seed-order-review-1'"), 1);
    assert.equal(await scalar(connection, "SELECT COUNT(*) count FROM shopping_cart_items sci JOIN shopping_carts sc ON sc.id=sci.cartId WHERE sc.activeDedupeKey IS NOT NULL"), 1);
    console.log("V4 可运行内容—产品—商城—沙箱支付—评价信用 MySQL 集成检查通过");
  } finally {
    await connection?.end();
    if (process.env.KEEP_INTEGRATION_DB !== "1") {
      await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    }
    await admin.end();
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
