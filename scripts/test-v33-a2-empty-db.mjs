import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

import { assertSafeA2DatabaseUrl } from "./lib/v33-a2-contract.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    JSON.stringify({
      status: "BLOCKED_BY_ENVIRONMENT",
      code: "A2-EMPTY-DB-DATABASE-URL-NOT-SET",
      message:
        "No explicit isolated DATABASE_URL was provided; no database connection was attempted.",
    }),
  );
  process.exit(0);
}

const { databaseName } = assertSafeA2DatabaseUrl(databaseUrl);
const root = process.cwd();
let temporaryMigrationRoot;
let connection;

function parseMysqlVersion(versionText) {
  const match = String(versionText).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Unable to parse MySQL version: ${versionText}`);
  return match.slice(1).map(Number);
}

async function countApplicationTables() {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
        AND table_name <> '__drizzle_migrations'`,
    [databaseName],
  );
  return Number(row.count);
}

async function directoryCounts() {
  const counts = {};
  for (const [key, table] of [
    ["identityTypes", "identity_types"],
    ["certificationTypes", "certification_types"],
    ["capabilities", "capabilities"],
    ["projectRoles", "project_roles"],
  ]) {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    counts[key] = Number(row.count);
  }
  return counts;
}

try {
  connection = await mysql.createConnection(databaseUrl);
  const [[versionRow]] = await connection.query("SELECT VERSION() AS version");
  const mysqlVersion = versionRow.version;
  const [major, minor, patch] = parseMysqlVersion(mysqlVersion);
  if (major !== 8 || minor !== 0 || patch < 34) {
    throw new Error(
      `A2.1 requires MySQL 8.0.34 or newer 8.0.x; found ${mysqlVersion}`,
    );
  }

  const initialCount = await countApplicationTables();
  if (initialCount !== 0) {
    throw new Error(
      `Refusing non-empty database ${databaseName}: found ${initialCount} application tables`,
    );
  }

  temporaryMigrationRoot = await mkdtemp(
    path.join(tmpdir(), "v33a2-baseline-"),
  );
  await mkdir(path.join(temporaryMigrationRoot, "meta"));
  const fullJournal = JSON.parse(
    await readFile(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"),
  );
  const baselineJournal = {
    ...fullJournal,
    entries: fullJournal.entries.slice(0, 15),
  };
  await writeFile(
    path.join(temporaryMigrationRoot, "meta", "_journal.json"),
    `${JSON.stringify(baselineJournal, null, 2)}\n`,
  );
  for (const entry of baselineJournal.entries) {
    await cp(
      path.join(root, "drizzle", `${entry.tag}.sql`),
      path.join(temporaryMigrationRoot, `${entry.tag}.sql`),
    );
  }

  const database = drizzle(connection);
  await migrate(database, { migrationsFolder: temporaryMigrationRoot });
  const baselineCount = await countApplicationTables();
  if (baselineCount !== 69) {
    throw new Error(
      `Baseline journal 0000-0014 produced ${baselineCount} tables instead of 69`,
    );
  }

  await migrate(database, { migrationsFolder: path.join(root, "drizzle") });
  const firstA21Count = await countApplicationTables();
  if (firstA21Count !== 75) {
    throw new Error(
      `A2.1 first migration produced ${firstA21Count} tables instead of 75`,
    );
  }
  const firstSeedCounts = await directoryCounts();

  await migrate(database, { migrationsFolder: path.join(root, "drizzle") });
  const secondA21Count = await countApplicationTables();
  const secondSeedCounts = await directoryCounts();
  if (secondA21Count !== firstA21Count) {
    throw new Error("Second migrate changed the application table count");
  }
  if (JSON.stringify(secondSeedCounts) !== JSON.stringify(firstSeedCounts)) {
    throw new Error("Second migrate changed frozen directory counts");
  }

  const [anomalyColumns] = await connection.query(
    `SELECT column_name AS columnName, is_nullable AS isNullable
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'migration_anomalies'`,
    [databaseName],
  );
  const anomalyColumnMap = new Map(
    anomalyColumns.map((row) => [row.columnName, row.isNullable]),
  );
  for (const column of [
    "migrationRunId",
    "severity",
    "handling",
    "status",
    "fingerprint",
    "detailChecksum",
  ]) {
    if (anomalyColumnMap.get(column) !== "NO") {
      throw new Error(
        `migration_anomalies.${column} was not tightened to NOT NULL`,
      );
    }
  }

  console.log(
    JSON.stringify({
      status: "PASS",
      databaseName,
      mysqlVersion,
      baselineTables: baselineCount,
      firstA21Tables: firstA21Count,
      secondA21Tables: secondA21Count,
      firstSeedCounts,
      secondSeedCounts,
      secondMigrateDelta: 0,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAIL",
      code: "A2-EMPTY-DB-TEST-FAILED",
      message: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
  if (temporaryMigrationRoot) {
    const resolved = path.resolve(temporaryMigrationRoot);
    const resolvedTmp = path.resolve(tmpdir());
    if (
      resolved.startsWith(`${resolvedTmp}${path.sep}`) &&
      path.basename(resolved).startsWith("v33a2-baseline-")
    ) {
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
