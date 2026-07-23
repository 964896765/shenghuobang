import assert from "node:assert/strict";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { resolveMysqlUrlFromEnv } from "./lib/mysql-test-config.mjs";

async function scalar(connection: mysql.Connection, sql: string) {
  const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const { rawUrl } = resolveMysqlUrlFromEnv({ consumerName: "V4 runnable integration" });
  const connection = await mysql.createConnection(rawUrl);
  try {
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
    await connection.end();
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
