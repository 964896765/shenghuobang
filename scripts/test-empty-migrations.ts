import "dotenv/config";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const DATABASE_NAME = "shenghuobang_empty_migration";
function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, shell: process.platform === "win32", stdio: "inherit", windowsHide: true });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)));
  });
}
async function main() {
  const source = new URL(process.env.MYSQL_INTEGRATION_URL ?? process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/mysql");
  const admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true });
  const target = new URL(source.toString()); target.pathname = `/${DATABASE_NAME}`;
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\`; CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const env = { ...process.env, DATABASE_URL: target.toString() };
    await run(command, ["db:migrate"], env);
    await run(command, ["db:migrate"], env);
    await admin.query(`USE \`${DATABASE_NAME}\``);
    const [versionRows] = await admin.query<(RowDataPacket & { version: string })[]>("SELECT version FROM app_schema_versions WHERE version='v3.2.1'");
    const [migrationRows] = await admin.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM __drizzle_migrations");
    const journal = JSON.parse(await readFile(path.resolve("drizzle/meta/_journal.json"), "utf8")) as { entries?: unknown[] };
    const expectedMigrationCount = journal.entries?.length ?? 0;
    if (versionRows.length !== 1 || Number(migrationRows[0]?.count) !== expectedMigrationCount) throw new Error("empty migration verification failed");
    console.log(`Empty database migrations passed twice; ${migrationRows[0].count} Drizzle migrations recorded`);
  } finally {
    if (process.env.KEEP_INTEGRATION_DB !== "1") await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``).catch(() => undefined);
    await admin.end();
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
