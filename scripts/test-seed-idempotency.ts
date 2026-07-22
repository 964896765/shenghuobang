import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import mysql, { type RowDataPacket } from "mysql2/promise";

type Snapshot = {
  users: number;
  profiles: number;
  needs: number;
  listings: number;
  recycling: number;
  verifications: number;
  products: number;
  units: number;
  skus: number;
  content: number;
  commerce: number;
};

function runSeed() {
  const result = spawnSync("pnpm", ["db:seed"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`db:seed 执行失败，退出码 ${result.status}：${result.error?.message ?? "未知错误"}`);
}

async function snapshot(connection: mysql.Connection) {
  const [rows] = await connection.query<(RowDataPacket & Snapshot)[]>(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE phone IN ('13800000001','13800000002','13800000003','13800000004','13800000005','13800000006','13800000007')) users,
      (SELECT COUNT(*) FROM user_profiles p JOIN users u ON u.id=p.userId WHERE u.phone IN ('13800000001','13800000002','13800000003','13800000004','13800000005','13800000006','13800000007')) profiles,
      (SELECT COUNT(*) FROM needs WHERE title IN ('需要开发一个家庭记账小程序','家里空调不制冷,需要维修','想给老人房间安装智能门锁和摄像头')) needs,
      (SELECT COUNT(*) FROM listings WHERE title IN ('九成新 iPhone 13 Pro 256G 远峰蓝','免费赠送:旧书一箱(约50本)','宜家 KALLAX 书柜,白色 2x4格')) listings,
      (SELECT COUNT(*) FROM recycling_requests WHERE title='旧洗衣机回收(海尔滚筒,2016年)') recycling,
      ((SELECT COUNT(*) FROM engineer_verifications ev JOIN users u ON u.id=ev.userId WHERE u.phone IN ('13800000002','13800000003') AND ev.status='approved') +
       (SELECT COUNT(*) FROM merchant_verifications mv JOIN users u ON u.id=mv.userId WHERE u.phone IN ('13800000004','13800000005') AND mv.status='approved')) verifications,
      (SELECT COUNT(*) FROM product_models WHERE publicCode LIKE 'DEMO-%') products,
      (SELECT COUNT(*) FROM product_units WHERE publicCode LIKE 'DEMO-UNIT-%') units,
      (SELECT COUNT(*) FROM listing_skus WHERE createdRequestId LIKE 'seed-sku-create-%') skus,
      (SELECT COUNT(*) FROM content_posts WHERE publicCode LIKE 'DEMO-CONTENT-%') content,
      ((SELECT COUNT(*) FROM orders WHERE title='[演示] iPhone 13 Pro 商城订单') +
       (SELECT COUNT(*) FROM payments WHERE paymentNo='PAY-DEMO-COMMERCE-001') +
       (SELECT COUNT(*) FROM reviews WHERE requestId='seed-order-review-1') +
       (SELECT COUNT(*) FROM credit_events WHERE requestId='credit:seed-order-review-1')) commerce
  `);
  return rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("test:seed:idempotent 需要 DATABASE_URL");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    runSeed();
    const first = await snapshot(connection);
    assert.deepEqual(first, { users: 7, profiles: 7, needs: 3, listings: 3, recycling: 1, verifications: 4, products: 3, units: 2, skus: 4, content: 7, commerce: 4 });
    runSeed();
    const second = await snapshot(connection);
    assert.deepEqual(second, first, "第二次 seed 改变了演示数据数量");
    console.log("幂等 Seed 测试通过：连续执行两次未重复创建演示用户、产品、内容、商品、订单、支付、评价或信用事件");
  } finally {
    await connection.end();
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
