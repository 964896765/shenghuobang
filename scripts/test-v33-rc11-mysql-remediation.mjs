import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import mysql from "mysql2/promise";

import {
  assertSafeNamedLocalTestDatabase,
  createMysqlConnectionOptions,
  resolveMysqlUrlFromEnv,
} from "./lib/mysql-test-config.mjs";

const { rawUrl, summary } = resolveMysqlUrlFromEnv({
  consumerName: "v3.3 rc1.1 remediation test",
});

assertSafeNamedLocalTestDatabase(rawUrl, {
  consumerName: "v3.3 rc1.1 remediation test",
  databaseNamePatterns: [
    /^shenghuobang_v33_rc\d+(?:_[a-z0-9]+)*$/,
    /(^|[_-])(test|rc|empty|restore)([_-]|$)/,
  ],
});

const connection = await mysql.createConnection(
  createMysqlConnectionOptions(rawUrl, { includeDatabase: true }),
);

function parseTimestamp(value) {
  return value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
}

try {
  const journal = JSON.parse(
    await readFile(path.resolve(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8"),
  );
  const expectedMigrationCount = Array.isArray(journal.entries) ? journal.entries.length : 0;

  const [migrationRows] = await connection.query(
    "SELECT COUNT(*) AS count FROM __drizzle_migrations",
  );
  assert.equal(
    Number(migrationRows[0]?.count),
    expectedMigrationCount,
    "drizzle migration count must match journal length",
  );

  const [runCreateRows] = await connection.query("SHOW CREATE TABLE `migration_runs`");
  const [checkpointCreateRows] = await connection.query("SHOW CREATE TABLE `migration_checkpoints`");
  const runCreateSql = String(runCreateRows[0]?.["Create Table"] ?? "");
  const checkpointCreateSql = String(checkpointCreateRows[0]?.["Create Table"] ?? "");

  assert.match(
    runCreateSql,
    /`updatedAt` timestamp\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP\(3\) ON UPDATE CURRENT_TIMESTAMP\(3\)/,
    "migration_runs.updatedAt DDL must preserve millisecond precision",
  );
  assert.match(
    checkpointCreateSql,
    /`updatedAt` timestamp\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP\(3\) ON UPDATE CURRENT_TIMESTAMP\(3\)/,
    "migration_checkpoints.updatedAt DDL must preserve millisecond precision",
  );

  const [columnRows] = await connection.execute(
    `SELECT table_name AS tableName,
            column_name AS columnName,
            column_type AS columnType,
            datetime_precision AS datetimePrecision,
            column_default AS columnDefault,
            extra AS extra
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name IN ('migration_runs', 'migration_checkpoints')
        AND column_name IN ('createdAt', 'updatedAt')
      ORDER BY table_name, column_name`,
    [summary.database],
  );

  for (const row of columnRows) {
    assert.equal(row.columnType, "timestamp(3)", `${row.tableName}.${row.columnName} must be timestamp(3)`);
    assert.equal(Number(row.datetimePrecision), 3, `${row.tableName}.${row.columnName} must keep millisecond precision`);
    assert.equal(String(row.columnDefault), "CURRENT_TIMESTAMP(3)", `${row.tableName}.${row.columnName} default must preserve precision`);
    if (row.columnName === "updatedAt") {
      assert.match(String(row.extra), /CURRENT_TIMESTAMP\(3\)/, `${row.tableName}.updatedAt extra must retain CURRENT_TIMESTAMP(3)`);
    }
  }

  await connection.execute("DELETE FROM migration_checkpoints WHERE migrationRunId = 'rc11-probe-run'");
  await connection.execute("DELETE FROM migration_runs WHERE migrationRunId = 'rc11-probe-run'");

  await connection.execute(
    `INSERT INTO migration_runs
      (migrationRunId, migrationVersion, runMode, runSequence, sourceBaseline, sourceChecksum, manifestChecksum, configurationChecksum, status)
      VALUES ('rc11-probe-run', 'v3.3-rc1.1', 'migrate', 1, 'empty-db', ?, ?, ?, 'pending')`,
    ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );

  const [[beforeRun]] = await connection.execute(
    "SELECT createdAt, updatedAt FROM migration_runs WHERE migrationRunId = 'rc11-probe-run'",
  );
  await connection.query("DO SLEEP(0.02)");
  await connection.execute(
    "UPDATE migration_runs SET status = 'running', startedAt = CURRENT_TIMESTAMP(3) WHERE migrationRunId = 'rc11-probe-run'",
  );
  const [[afterRun]] = await connection.execute(
    "SELECT createdAt, updatedAt FROM migration_runs WHERE migrationRunId = 'rc11-probe-run'",
  );

  assert.equal(
    parseTimestamp(beforeRun.createdAt),
    parseTimestamp(afterRun.createdAt),
    "migration_runs.createdAt must stay unchanged after updates",
  );
  assert(
    parseTimestamp(afterRun.updatedAt) > parseTimestamp(beforeRun.updatedAt),
    "migration_runs.updatedAt must advance after updates",
  );

  await connection.execute(
    `INSERT INTO migration_checkpoints
      (migrationRunId, checkpointKey, phase, entityType, batchSize, checksum)
      VALUES ('rc11-probe-run', 'validate:1', 'validate', 'probe', 10, ?)`,
    ["d".repeat(64)],
  );

  const [[beforeCheckpoint]] = await connection.execute(
    "SELECT id, createdAt, updatedAt FROM migration_checkpoints WHERE migrationRunId = 'rc11-probe-run' AND checkpointKey = 'validate:1'",
  );
  await connection.query("DO SLEEP(0.02)");
  await connection.execute(
    "UPDATE migration_checkpoints SET status = 'running', attemptCount = attemptCount + 1 WHERE id = ?",
    [beforeCheckpoint.id],
  );
  const [[afterCheckpoint]] = await connection.execute(
    "SELECT createdAt, updatedAt FROM migration_checkpoints WHERE id = ?",
    [beforeCheckpoint.id],
  );

  assert.equal(
    parseTimestamp(beforeCheckpoint.createdAt),
    parseTimestamp(afterCheckpoint.createdAt),
    "migration_checkpoints.createdAt must stay unchanged after updates",
  );
  assert(
    parseTimestamp(afterCheckpoint.updatedAt) > parseTimestamp(beforeCheckpoint.updatedAt),
    "migration_checkpoints.updatedAt must advance after updates",
  );

  console.log("V3.3 RC1.1 MySQL remediation: PASS");
  console.log(`database=${summary.database} journal=${expectedMigrationCount}`);
  console.log("verified=ddl,column_precision,createdAt_stability,updatedAt_progress");
} finally {
  await connection.execute("DELETE FROM migration_checkpoints WHERE migrationRunId = 'rc11-probe-run'").catch(() => undefined);
  await connection.execute("DELETE FROM migration_runs WHERE migrationRunId = 'rc11-probe-run'").catch(() => undefined);
  await connection.end();
}
