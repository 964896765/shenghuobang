import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import mysql from "mysql2/promise";

import {
  assertSafeNamedLocalTestDatabase,
  createMysqlConnectionOptions,
  replaceMysqlDatabaseName,
  resolveMysqlUrlFromEnv,
} from "./lib/mysql-test-config.mjs";

const MAIN_DATABASE_PATTERNS = [
  /^shenghuobang_v33_rc\d+(?:_[a-z0-9]+)*$/,
  /(^|[_-])(test|rc|empty|restore)([_-]|$)/,
];

const { rawUrl, summary } = resolveMysqlUrlFromEnv({
  consumerName: "v3.3 rc1.1 restore reconcile",
});

assertSafeNamedLocalTestDatabase(rawUrl, {
  consumerName: "v3.3 rc1.1 restore reconcile main",
  databaseNamePatterns: MAIN_DATABASE_PATTERNS,
});

const restoreDatabaseName = process.env.MYSQL_RESTORE_DATABASE?.trim() || "shenghuobang_v33_rc1_restore";
const restoreUrl = replaceMysqlDatabaseName(rawUrl, restoreDatabaseName);
assertSafeNamedLocalTestDatabase(restoreUrl, {
  consumerName: "v3.3 rc1.1 restore reconcile restore",
  databaseNamePatterns: MAIN_DATABASE_PATTERNS,
});

const mainConnection = await mysql.createConnection(
  createMysqlConnectionOptions(rawUrl, { includeDatabase: true }),
);
const restoreConnection = await mysql.createConnection(
  createMysqlConnectionOptions(restoreUrl, { includeDatabase: true }),
);

async function scalar(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function countTables(connection, databaseName) {
  return Number(
    await scalar(
      connection,
      `SELECT COUNT(*) AS count
         FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type = 'BASE TABLE'`,
      [databaseName],
    ),
  );
}

async function countRows(connection, tableName) {
  return Number(await scalar(connection, `SELECT COUNT(*) AS count FROM \`${tableName}\``));
}

async function showCreateTable(connection, tableName) {
  const [rows] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
  return String(rows[0]?.["Create Table"] ?? "");
}

function normalizeCreateTable(sql) {
  return String(sql)
    .replaceAll(" CHARACTER SET utf8mb4", "")
    .replace(/\s+/g, " ")
    .trim();
}

try {
  const journal = JSON.parse(
    await readFile(path.resolve(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8"),
  );
  const expectedMigrationCount = Array.isArray(journal.entries) ? journal.entries.length : 0;
  const keyTables = [
    "users",
    "capabilities",
    "identity_types",
    "certification_types",
    "project_roles",
    "migration_runs",
    "migration_checkpoints",
  ];
  const ddlTables = [
    "capabilities",
    "identity_types",
    "certification_types",
    "project_roles",
    "migration_runs",
    "migration_checkpoints",
  ];
  const rowCounts = {};
  const ddlMatches = {};

  const mainTableCount = await countTables(mainConnection, summary.database);
  const restoreTableCount = await countTables(restoreConnection, restoreDatabaseName);
  assert(mainTableCount > 0, "main database must contain application tables after restore validation");
  assert.equal(restoreTableCount, mainTableCount, "restore table count must match main database");

  const mainMigrationCount = await countRows(mainConnection, "__drizzle_migrations");
  const restoreMigrationCount = await countRows(restoreConnection, "__drizzle_migrations");
  assert.equal(mainMigrationCount, expectedMigrationCount, "main migration count must match journal");
  assert.equal(restoreMigrationCount, expectedMigrationCount, "restore migration count must match journal");

  for (const tableName of keyTables) {
    const main = await countRows(mainConnection, tableName);
    const restore = await countRows(restoreConnection, tableName);
    assert.equal(restore, main, `${tableName} row count must match after restore`);
    rowCounts[tableName] = { main, restore };
  }

  for (const tableName of ddlTables) {
    const mainDdl = normalizeCreateTable(await showCreateTable(mainConnection, tableName));
    const restoreDdl = normalizeCreateTable(await showCreateTable(restoreConnection, tableName));
    assert.equal(restoreDdl, mainDdl, `${tableName} DDL must match after restore`);
    ddlMatches[tableName] = true;
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        mainDatabase: summary.database,
        restoreDatabase: restoreDatabaseName,
        expectedMigrationCount,
        tableCount: {
          main: mainTableCount,
          restore: restoreTableCount,
        },
        migrationCount: {
          main: mainMigrationCount,
          restore: restoreMigrationCount,
        },
        rowCounts,
        ddlMatches,
      },
      null,
      2,
    ),
  );
} finally {
  await mainConnection.end();
  await restoreConnection.end();
}
