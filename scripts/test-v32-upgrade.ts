import "dotenv/config";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { runV32DataRepair } from "./repair-v32-data";

const DATABASE_NAME = "shenghuobang_v32_upgrade";
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(`V3.2 upgrade failed: ${message}`); }
async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}
async function apply(connection: mysql.Connection, file: string) {
  const sql = (await readFile(path.resolve("drizzle", file), "utf8")).replaceAll("--> statement-breakpoint", "");
  await connection.query(sql);
}

async function main() {
  const source = new URL(process.env.MYSQL_INTEGRATION_URL ?? process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/mysql");
  const connection = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${DATABASE_NAME}\`;`);
    const migrations = (await readdir(path.resolve("drizzle"))).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    for (const file of migrations.filter((file) => file < "0007_")) await apply(connection, file);
    const [owner] = await connection.execute<ResultSetHeader>("INSERT INTO users (openId,phone,passwordHash,name) VALUES ('upgrade:owner','18800000601','integration','升级用户')");
    const fixtures = [
      ["普通出售", "published", "listed", JSON.stringify(["fixed_price"])],
      ["接受报价", "reserved", "reserved", JSON.stringify(["accept_offers"])],
      ["赠送", "published", "listed", JSON.stringify(["giveaway"])],
      ["回收", "published", "recycling", JSON.stringify(["recycle"])],
      ["已完成", "completed", "sold", JSON.stringify(["fixed_price"])],
      ["已取消", "published", "listed", JSON.stringify(["fixed_price"])],
      ["无 modes", "published", "listed", null],
      ["重复 modes", "published", "listed", JSON.stringify(["fixed_price", "fixed_price", "accept_offers"])],
      ["异常 modes", "published", "listed", JSON.stringify([])],
    ] as const;
    for (const fixture of fixtures) await connection.execute(
      "INSERT INTO listings (sellerId,title,modes,primaryMode,price,status,itemStatus) VALUES (?,?,?,'fixed_price',100,?,?)",
      [owner.insertId, fixture[0], fixture[3], fixture[1], fixture[2]],
    );
    await connection.execute("INSERT INTO orders (orderType,buyerId,sellerId,refId,title,amount,status) VALUES ('listing',?,?,5,'已完成订单',100,'completed'),('listing',?,?,6,'已取消订单',100,'cancelled')", [owner.insertId, owner.insertId, owner.insertId, owner.insertId]);
    for (const file of migrations.filter((file) => file >= "0007_")) await apply(connection, file);
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM listings WHERE itemId IS NULL") === 0, "listing item backfill incomplete");
    check(await scalar<number>(connection, "SELECT COUNT(DISTINCT itemId) value FROM listings") === fixtures.length, "duplicate item generated for listings");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM item_ownership_history WHERE transferType='created'") === fixtures.length, "ownership history count mismatch");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM listing_modes WHERE listingId=(SELECT id FROM listings WHERE title='重复 modes')") === 2, "duplicate modes not deduplicated");
    await runV32DataRepair(connection);
    const itemCount = await scalar<number>(connection, "SELECT COUNT(*) value FROM items");
    const ownershipCount = await scalar<number>(connection, "SELECT COUNT(*) value FROM item_ownership_history");
    const modeCount = await scalar<number>(connection, "SELECT COUNT(*) value FROM listing_modes");
    await runV32DataRepair(connection);
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM items") === itemCount, "repeat repair duplicated items");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM item_ownership_history") === ownershipCount, "repeat repair duplicated ownership");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM listing_modes") === modeCount, "repeat repair duplicated modes");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM migration_anomalies WHERE code='missing_valid_mode'") === 1, "anomaly was not recorded exactly once");
    check(await scalar<number>(connection, "SELECT COUNT(*) value FROM information_schema.statistics WHERE table_schema=? AND index_name IN ('messages_conversation_order_idx','notification_deliveries_retry_idx','stored_files_owner_idx','orders_status_idx')", [DATABASE_NAME]) >= 4, "required indexes missing");
    console.log("V3.1.2 -> V3.2.1 upgrade test passed: 9 historical listing variants, repeat repair is idempotent");
  } finally {
    if (process.env.KEEP_INTEGRATION_DB !== "1") await connection.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    await connection.end();
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
