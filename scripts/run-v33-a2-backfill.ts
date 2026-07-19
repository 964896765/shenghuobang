import "./load-env.cjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPool } from "mysql2/promise";
import { assertSafeMigrationDatabase, sha256 } from "../server/migration/v33-a2/contract";
import { buildEnvironmentBlockedReport, buildMigrationReport, reportJson, reportMarkdown } from "../server/migration/v33-a2/reporter";
import { loadLegacyFixture, MigrationRunner, MysqlMigrationStore } from "../server/migration/v33-a2/runner";

async function main() {
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function sourceChecksum(): Promise<string> {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const files = (await readdir(drizzleDir)).filter((file) => /^00(?:0\d|1[0-4])_.+\.sql$/.test(file)).sort();
  if (files.length !== 15) throw new Error(`Expected 15 baseline migrations, found ${files.length}`);
  const rows: string[] = [];
  for (const file of files) {
    const bytes = await readFile(path.join(drizzleDir, file));
    rows.push(`drizzle/${file}|${bytes.length}|${createHash("sha256").update(bytes).digest("hex")}`);
  }
  return sha256(rows.join("\n"));
}

async function persistReport(report: ReturnType<typeof buildEnvironmentBlockedReport>, reportDirectory: string) {
  await mkdir(reportDirectory, { recursive: true });
  const stem = report.migrationRunId ?? `blocked-${report.generatedAt.replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(reportDirectory, `${stem}.json`);
  const markdownPath = path.join(reportDirectory, `${stem}.md`);
  await Promise.all([
    writeFile(jsonPath, reportJson(report), "utf8"),
    writeFile(markdownPath, reportMarkdown(report), "utf8"),
  ]);
  console.log(`reportJson=${jsonPath}`);
  console.log(`reportMarkdown=${markdownPath}`);
}

const reportDirectory = path.resolve(argument("--report-dir") ?? "artifacts/v33-a2-migration");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  const report = buildEnvironmentBlockedReport({
    generatedAt: new Date(),
    reason: "DATABASE_URL is not explicitly set; no database connection was attempted",
  });
  await persistReport(report, reportDirectory);
  console.log("databaseExecution=BLOCKED_BY_ENVIRONMENT");
  process.exit(0);
}

const safeUrl = assertSafeMigrationDatabase(databaseUrl);
const pool = createPool({ uri: safeUrl.toString(), connectionLimit: 1 });
const connection = await pool.getConnection();
try {
  const [versionRows] = await connection.query<Array<{ version: string } & import("mysql2").RowDataPacket>>("SELECT VERSION() AS version");
  const mysqlVersion = String(versionRows[0]?.version ?? "unknown");
  if (!/^8\.0\.(?:3[4-9]|[4-9]\d)/.test(mysqlVersion)) throw new Error(`MySQL 8.0.34+ required, found ${mysqlVersion}`);
  const checksum = await sourceChecksum();
  const store = new MysqlMigrationStore(connection);
  const runner = new MigrationRunner(store);
  const recoveryTarget = argument("--recovery");
  const resumeMigrationRunId = argument("--resume");
  const rerunParent = argument("--rerun");
  const result = recoveryTarget
    ? await runner.recovery({ sourceChecksum: checksum, targetMigrationRunId: recoveryTarget, checkpointKey: argument("--checkpoint"), checkpointChecksum: argument("--checkpoint-checksum") })
    : await runner.migrate(await loadLegacyFixture(connection), {
        sourceChecksum: checksum,
        runMode: rerunParent ? "rerun" : "migrate",
        parentMigrationRunId: rerunParent,
        resumeMigrationRunId,
      });
  const report = buildMigrationReport(result, { generatedAt: new Date(), databaseExecution: "EXECUTED" });
  await persistReport(report, reportDirectory);
  console.log(`migrationRunId=${result.run.migrationRunId}`);
  console.log(`status=${result.run.status}`);
  console.log(`mysqlVersion=${mysqlVersion}`);
  if (result.run.status !== "completed") process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
