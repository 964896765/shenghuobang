import "dotenv/config";
import { spawn } from "node:child_process";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import type { TrpcContext } from "../server/_core/context";

const DATABASE_NAME = "shenghuobang_location_integration";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`位置集成测试失败：${message}`);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(), env, shell: process.platform === "win32", stdio: "inherit", windowsHide: true,
    });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)));
  });
}

async function scalar<T>(connection: mysql.Connection, query: string, params: unknown[] = []) {
  const [rows] = await connection.execute<(RowDataPacket & { value: T })[]>(query, params);
  return rows[0]?.value;
}

async function main() {
  const source = new URL(process.env.MYSQL_INTEGRATION_URL ?? process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/mysql");
  const admin = await mysql.createConnection({
    host: source.hostname,
    port: Number(source.port || 3306),
    user: decodeURIComponent(source.username),
    password: decodeURIComponent(source.password),
    multipleStatements: true,
  });
  const target = new URL(source.toString());
  target.pathname = `/${DATABASE_NAME}`;
  const results: string[] = [];
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await run(command, ["db:migrate"], { ...process.env, DATABASE_URL: target.toString() });
    await admin.query(`USE \`${DATABASE_NAME}\``);
    process.env.DATABASE_URL = target.toString();

    const [first] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name) VALUES ('location:first','18800000401','integration','位置用户A')",
    );
    const [second] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name) VALUES ('location:second','18800000402','integration','位置用户B')",
    );
    const [third] = await admin.execute<ResultSetHeader>(
      "INSERT INTO users (openId,phone,passwordHash,name) VALUES ('location:rollback','18800000403','integration','回滚用户')",
    );
    await admin.execute("INSERT INTO engineer_profiles (userId,realName,professionalTitle,primaryCategory,cityName,verificationLevel,rating) VALUES (?,?,?,?,?,'professional',50)", [second.insertId, "位置工程师", "维修工程师", "家电", "北京市海淀区"]);

    const db = await import("../server/db");
    const { appRouter } = await import("../server/routers");
    const firstUser = await db.getUserById(first.insertId);
    check(firstUser, "测试用户创建失败");
    const caller = appRouter.createCaller({ user: firstUser, req: {}, res: {} } as TrpcContext);

    await caller.location.update({ source: "device", latitude: 39.987654, longitude: 116.321987, regionName: "北京市海淀区" });
    const preference = await caller.location.me();
    check(preference?.userId === first.insertId, "位置偏好未绑定当前账号");
    check(await scalar<string>(admin, "SELECT approximateLatitude value FROM user_location_preferences WHERE userId=?", [first.insertId]) === "39.99", "纬度未降精度");
    check(await scalar<string>(admin, "SELECT approximateLongitude value FROM user_location_preferences WHERE userId=?", [first.insertId]) === "116.32", "经度未降精度");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM user_location_preferences WHERE userId=?", [first.insertId]) === 1, "首次位置未保存");
    results.push("首次设备位置保存并降为约 1 公里精度");

    await caller.location.update({ source: "manual", regionName: "上海市浦东新区", cityName: "上海市" });
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM user_location_preferences WHERE userId=?", [first.insertId]) === 1, "重复更新产生重复偏好");
    check(await scalar<string>(admin, "SELECT source value FROM user_location_preferences WHERE userId=?", [first.insertId]) === "manual", "手动地区未覆盖当前来源");
    check(await scalar<string | null>(admin, "SELECT approximateLatitude value FROM user_location_preferences WHERE userId=?", [first.insertId]) === null, "手动地区仍残留设备坐标");
    results.push("手动地区和重复更新幂等");

    await db.saveLocationPreference({ userId: second.insertId, source: "device", approximateLatitude: 39.98, approximateLongitude: 116.31, regionName: "北京市海淀区", actorRole: "user" });
    const engineers = await caller.engineers.list({ latitude: 39.99, longitude: 116.32, region: "北京市海淀区" });
    check(engineers[0]?.distanceLabel?.startsWith("约 "), "附近工程师未返回近似距离");
    const publicPayload = JSON.stringify(engineers);
    check(!publicPayload.includes("approximateLatitude") && !publicPayload.includes("approximateLongitude"), "公开响应泄露近似坐标字段");
    check(!publicPayload.includes("39.98") && !publicPayload.includes("116.31"), "公开响应泄露坐标值");
    results.push("距离排序只返回近似距离，不返回他人坐标");

    await caller.location.update({ source: "manual", regionName: "北京市海淀区" });
    check(await scalar<string>(admin, "SELECT regionName value FROM user_location_preferences WHERE userId=?", [second.insertId]) === "北京市海淀区", "客户端操作越权修改了其他用户位置");
    results.push("位置写入只能修改当前账号");

    const auditDetail = await scalar<string>(admin, "SELECT CAST(detail AS CHAR) value FROM audit_logs WHERE actorId=? AND action='location.preference.update' ORDER BY id DESC LIMIT 1", [first.insertId]);
    check(!auditDetail.includes("latitude") && !auditDetail.includes("longitude"), "审计日志记录了坐标");
    results.push("位置审计不记录精确坐标");

    await admin.query(`CREATE TRIGGER fail_location_audit BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action='location.preference.update' AND NEW.actorId=${third.insertId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='controlled audit failure'; END IF; END`);
    let failed = false;
    try {
      await db.saveLocationPreference({ userId: third.insertId, source: "manual", regionName: "测试区", actorRole: "user" });
    } catch {
      failed = true;
    }
    await admin.query("DROP TRIGGER fail_location_audit");
    check(failed, "受控数据库故障未触发");
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM user_location_preferences WHERE userId=?", [third.insertId]) === 0, "审计失败后位置偏好未回滚");
    results.push("数据库故障时位置与审计事务完整回滚");

    await caller.location.clear();
    check(await scalar<number>(admin, "SELECT COUNT(*) value FROM user_location_preferences WHERE userId=?", [first.insertId]) === 0, "用户位置清理失败");
    results.push("账号位置偏好可安全清理");

    console.log(`V3.2.4-R2 location MySQL integration passed: ${results.length} groups`);
    results.forEach((result) => console.log(`  ✓ ${result}`));
  } finally {
    if (process.env.KEEP_INTEGRATION_DB !== "1") await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    await admin.end();
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
