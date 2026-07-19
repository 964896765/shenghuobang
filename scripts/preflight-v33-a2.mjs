#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log(`Usage: node scripts/preflight-v33-a2.mjs [--format=json|markdown|both]

Requires DATABASE_URL for a read-only MySQL account. The script executes only
SELECT, SHOW, DESCRIBE and information_schema queries. It never emits row-level
personal or business content.`);
  process.exit(0);
}

const formatArg = process.argv.find(value => value.startsWith("--format="));
const format = formatArg?.slice("--format=".length) ?? "both";
if (!new Set(["json", "markdown", "both"]).has(format)) {
  throw new Error("--format must be json, markdown, or both");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("A2 preflight not executed: DATABASE_URL is not set.");
  process.exit(2);
}

const root = process.cwd();
const schemaPath = path.join(root, "drizzle", "schema.ts");
const migrationDir = path.join(root, "drizzle");

function sha256(bufferOrText) {
  return crypto.createHash("sha256").update(bufferOrText).digest("hex");
}

function expectedSchema() {
  const source = fs.readFileSync(schemaPath, "utf8");
  const starts = [...source.matchAll(/export const (\w+) = mysqlTable\(\s*"([^"]+)"/g)]
    .map(match => ({ symbol: match[1], table: match[2], index: match.index }));
  return starts.map((entry, index) => {
    const block = source.slice(entry.index, starts[index + 1]?.index ?? source.length);
    const columns = [...block.matchAll(
      /^\s{2,}(\w+):\s*(int|bigint|varchar|char|text|longtext|boolean|decimal|float|double|timestamp|datetime|date|json|mysqlEnum)\("([^"]+)"/gm,
    )].map(match => match[3]);
    return { table: entry.table, columns };
  });
}

function expectedMigrations() {
  return fs.readdirSync(migrationDir)
    .filter(file => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .map(file => {
      const bytes = fs.readFileSync(path.join(migrationDir, file));
      return { file, bytes: bytes.length, sha256: sha256(bytes) };
    });
}

function assertReadOnlySql(sql) {
  const normalized = sql.trim().replace(/;\s*$/, "");
  if (!/^(SELECT|SHOW|DESCRIBE)\b/i.test(normalized)) {
    throw new Error(`Rejected non-read-only SQL: ${normalized.split(/\s+/)[0] || "empty"}`);
  }
  if (normalized.includes(";")) throw new Error("Rejected multi-statement SQL");
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/mysql:\/\/[^\s]+/gi, "[DATABASE_URL]")
    .replace(/password\s*[=:]\s*[^\s,;]+/gi, "password=[REDACTED]")
    .slice(0, 500);
}

function scalar(rows, field = "value") {
  return Number(rows[0]?.[field] ?? 0);
}

function toMarkdown(report) {
  const lines = [
    "# V3.3-A / A2 read-only preflight",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Database: ${report.database.databaseName || "unknown"}`,
    `- MySQL: ${report.database.version || "unknown"}`,
    `- Blocking findings: ${report.summary.blocking}`,
    `- Warnings: ${report.summary.warnings}`,
    "",
    "## Environment",
    "",
    "| Key | Value |",
    "|---|---|",
    `| character_set_server | ${report.database.characterSetServer || "unknown"} |`,
    `| collation_server | ${report.database.collationServer || "unknown"} |`,
    `| sql_mode | ${report.database.sqlMode || "unknown"} |`,
    `| innodb_default_row_format | ${report.database.innodbDefaultRowFormat || "unknown"} |`,
    "",
    "## Counts and distributions",
    "",
    "```json",
    JSON.stringify(report.counts, null, 2),
    "```",
    "",
    "## Schema comparison",
    "",
    `- Expected tables: ${report.schema.expectedTableCount}`,
    `- Actual tables: ${report.schema.actualTableCount}`,
    `- Missing tables: ${report.schema.missingTables.join(", ") || "none"}`,
    `- Unexpected tables: ${report.schema.unexpectedTables.join(", ") || "none"}`,
    `- Column mismatches: ${report.schema.columnMismatches.length}`,
    "",
    "## Migration journal",
    "",
    `- Expected files: ${report.migrations.expectedCount}`,
    `- Journal rows: ${report.migrations.journalCount}`,
    `- Missing/unmatched: ${report.migrations.mismatches.length}`,
    "",
    "## Findings",
    "",
    "| Severity | Code | Count/Detail |",
    "|---|---|---|",
    ...report.findings.map(item => `| ${item.severity} | ${item.code} | ${item.count ?? item.detail ?? "-"} |`),
    "",
    "This report intentionally contains only aggregate counts, enum/code distributions, and schema metadata.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch (error) {
    throw new Error(`mysql2 runtime unavailable; install state must be restored outside this task: ${safeError(error)}`);
  }

  const connection = await mysql.default.createConnection({ uri: databaseUrl, multipleStatements: false });
  const run = async (sql, params = []) => {
    assertReadOnlySql(sql);
    const [rows] = await connection.execute(sql, params);
    return rows;
  };
  const findings = [];
  const addFinding = (severity, code, countOrDetail) => findings.push({
    severity,
    code,
    ...(typeof countOrDetail === "number" ? { count: countOrDetail } : { detail: countOrDetail }),
  });

  try {
    const environmentRows = await run(`SELECT
      DATABASE() AS databaseName,
      VERSION() AS version,
      @@version_comment AS versionComment,
      @@character_set_server AS characterSetServer,
      @@collation_server AS collationServer,
      @@sql_mode AS sqlMode,
      @@innodb_default_row_format AS innodbDefaultRowFormat`);
    const environment = environmentRows[0] ?? {};
    const databaseName = String(environment.databaseName ?? "");
    if (!databaseName) throw new Error("DATABASE_URL must select a database");

    const actualTableRows = await run(
      `SELECT table_name AS tableName, engine, table_rows AS estimatedRows, data_length AS dataLength,
              index_length AS indexLength, table_collation AS tableCollation
       FROM information_schema.tables WHERE table_schema=? ORDER BY table_name`,
      [databaseName],
    );
    const actualColumnRows = await run(
      `SELECT table_name AS tableName, column_name AS columnName, column_type AS columnType,
              is_nullable AS isNullable, column_default AS columnDefault, extra
       FROM information_schema.columns WHERE table_schema=? ORDER BY table_name, ordinal_position`,
      [databaseName],
    );
    const actualIndexRows = await run(
      `SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique,
              GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columnsList
       FROM information_schema.statistics WHERE table_schema=?
       GROUP BY table_name,index_name,non_unique ORDER BY table_name,index_name`,
      [databaseName],
    );
    const expected = expectedSchema();
    const actualTables = actualTableRows.map(row => String(row.tableName));
    const expectedTables = expected.map(row => row.table);
    const missingTables = expectedTables.filter(table => !actualTables.includes(table));
    const unexpectedTables = actualTables.filter(table => !expectedTables.includes(table) && table !== "__drizzle_migrations");
    const columnsByTable = new Map();
    for (const row of actualColumnRows) {
      const list = columnsByTable.get(String(row.tableName)) ?? [];
      list.push(String(row.columnName));
      columnsByTable.set(String(row.tableName), list);
    }
    const columnMismatches = expected.flatMap(item => {
      const actual = columnsByTable.get(item.table) ?? [];
      const missing = item.columns.filter(column => !actual.includes(column));
      const unexpected = actual.filter(column => !item.columns.includes(column));
      return missing.length || unexpected.length ? [{ table: item.table, missing, unexpected }] : [];
    });
    if (missingTables.length || columnMismatches.length) {
      addFinding("BLOCKING", "SCHEMA_BASELINE_MISMATCH", missingTables.length + columnMismatches.length);
    }

    const tableExists = table => actualTables.includes(table);
    const groupCount = async (table, column) => tableExists(table)
      ? run(`SELECT \`${column}\` AS code, COUNT(*) AS count FROM \`${table}\` GROUP BY \`${column}\` ORDER BY \`${column}\``)
      : [];
    const countQuery = async sql => scalar(await run(sql));

    const counts = {
      users: tableExists("users") ? await countQuery("SELECT COUNT(*) AS value FROM users") : null,
      userRoles: await groupCount("users", "role"),
      currentRoles: await groupCount("user_profiles", "currentRole"),
      identityVerificationStatuses: await groupCount("identity_verifications", "status"),
      engineerVerificationStatuses: await groupCount("engineer_verifications", "status"),
      merchantVerificationStatuses: await groupCount("merchant_verifications", "status"),
      ownerEqualsEngineerProjects: tableExists("projects")
        ? await countQuery("SELECT COUNT(*) AS value FROM projects WHERE ownerId=engineerId") : null,
    };

    if (tableExists("engineer_profiles")) {
      const count = await countQuery("SELECT COUNT(*) AS value FROM engineer_profiles p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL");
      if (count) addFinding("BLOCKING", "ENGINEER_PROFILE_ORPHAN", count);
    }
    if (tableExists("merchant_profiles")) {
      const count = await countQuery("SELECT COUNT(*) AS value FROM merchant_profiles p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL");
      if (count) addFinding("BLOCKING", "MERCHANT_PROFILE_ORPHAN", count);
    }
    if (tableExists("user_profiles") && tableExists("engineer_verifications")) {
      const count = await countQuery(`SELECT COUNT(*) AS value FROM user_profiles p
        WHERE p.engineerStatus='active' AND NOT EXISTS
        (SELECT 1 FROM engineer_verifications v WHERE v.userId=p.userId AND v.status='approved')`);
      if (count) addFinding("WARNING", "ENGINEER_STATE_CONFLICT", count);
    }
    if (tableExists("user_profiles") && tableExists("merchant_verifications")) {
      const count = await countQuery(`SELECT COUNT(*) AS value FROM user_profiles p
        WHERE p.merchantStatus='active' AND NOT EXISTS
        (SELECT 1 FROM merchant_verifications v WHERE v.userId=p.userId AND v.status='approved')`);
      if (count) addFinding("WARNING", "MERCHANT_STATE_CONFLICT", count);
    }
    if (tableExists("verification_documents")) {
      const count = await countQuery(`SELECT COUNT(*) AS value FROM verification_documents d
        LEFT JOIN identity_verifications i ON d.verificationType='identity' AND i.id=d.verificationId
        LEFT JOIN engineer_verifications e ON d.verificationType='engineer' AND e.id=d.verificationId
        LEFT JOIN merchant_verifications m ON d.verificationType='merchant' AND m.id=d.verificationId
        WHERE (d.verificationType='identity' AND i.id IS NULL)
           OR (d.verificationType='engineer' AND e.id IS NULL)
           OR (d.verificationType='merchant' AND m.id IS NULL)`);
      if (count) addFinding("BLOCKING", "VERIFICATION_DOCUMENT_ORPHAN", count);
    }
    if (tableExists("projects")) {
      const ownerOrphans = await countQuery("SELECT COUNT(*) AS value FROM projects p LEFT JOIN users u ON u.id=p.ownerId WHERE u.id IS NULL");
      const engineerOrphans = await countQuery("SELECT COUNT(*) AS value FROM projects p LEFT JOIN users u ON u.id=p.engineerId WHERE u.id IS NULL");
      if (ownerOrphans) addFinding("BLOCKING", "PROJECT_OWNER_ORPHAN", ownerOrphans);
      if (engineerOrphans) addFinding("BLOCKING", "PROJECT_ENGINEER_ORPHAN", engineerOrphans);
    }
    if (tableExists("project_files") && tableExists("projects")) {
      const count = await countQuery(`SELECT COUNT(*) AS value FROM project_files f
        JOIN projects p ON p.id=f.projectId
        WHERE f.uploadedBy<>p.ownerId AND f.uploadedBy<>p.engineerId`);
      if (count) addFinding("WARNING", "PROJECT_FILE_UPLOADER_OUTSIDE_LEGACY_PARTIES", count);
    }

    let acceptanceActorDistribution = [];
    if (tableExists("project_acceptances") && tableExists("projects")) {
      acceptanceActorDistribution = await run(`SELECT
        CASE WHEN a.submittedBy=p.ownerId THEN 'owner'
             WHEN a.submittedBy=p.engineerId THEN 'engineer'
             WHEN u.id IS NULL THEN 'orphan'
             ELSE 'other' END AS actorRelation,
        COUNT(*) AS count
        FROM project_acceptances a JOIN projects p ON p.id=a.projectId
        LEFT JOIN users u ON u.id=a.submittedBy
        GROUP BY actorRelation ORDER BY actorRelation`);
    }

    const anomalyColumns = actualColumnRows
      .filter(row => row.tableName === "migration_anomalies")
      .map(row => ({ name: row.columnName, type: row.columnType, nullable: row.isNullable }));
    const anomalyCount = tableExists("migration_anomalies")
      ? await countQuery("SELECT COUNT(*) AS value FROM migration_anomalies") : null;
    const anomalyCodes = tableExists("migration_anomalies")
      ? await groupCount("migration_anomalies", "code") : [];

    const expectedMigrationRows = expectedMigrations();
    let journalRows = [];
    if (tableExists("__drizzle_migrations")) {
      journalRows = await run("SELECT id, hash, created_at AS createdAt FROM __drizzle_migrations ORDER BY id");
    }
    const migrationMismatches = [];
    if (journalRows.length !== expectedMigrationRows.length) {
      migrationMismatches.push({ type: "count", expected: expectedMigrationRows.length, actual: journalRows.length });
    }
    for (let index = 0; index < Math.min(journalRows.length, expectedMigrationRows.length); index += 1) {
      if (String(journalRows[index].hash) !== expectedMigrationRows[index].sha256) {
        migrationMismatches.push({ type: "hash", position: index, file: expectedMigrationRows[index].file });
      }
    }
    if (migrationMismatches.length) addFinding("BLOCKING", "MIGRATION_JOURNAL_MISMATCH", migrationMismatches.length);

    const alterRiskTables = new Set(["projects", "milestones", "project_files", "project_acceptances", "stored_files", "conversations"]);
    const alterRisks = actualTableRows
      .filter(row => alterRiskTables.has(String(row.tableName)))
      .map(row => ({
        table: row.tableName,
        estimatedRows: Number(row.estimatedRows ?? 0),
        dataLength: Number(row.dataLength ?? 0),
        indexLength: Number(row.indexLength ?? 0),
        collation: row.tableCollation,
      }));

    const report = {
      generatedAt: new Date().toISOString(),
      database: {
        databaseName,
        version: environment.version,
        versionComment: environment.versionComment,
        characterSetServer: environment.characterSetServer,
        collationServer: environment.collationServer,
        sqlMode: environment.sqlMode,
        innodbDefaultRowFormat: environment.innodbDefaultRowFormat,
      },
      schema: {
        expectedTableCount: expectedTables.length,
        actualTableCount: actualTables.length,
        missingTables,
        unexpectedTables,
        columnMismatches,
        indexCount: actualIndexRows.length,
      },
      migrations: {
        expectedCount: expectedMigrationRows.length,
        expected: expectedMigrationRows,
        journalCount: journalRows.length,
        mismatches: migrationMismatches,
      },
      counts: {
        ...counts,
        acceptanceActorDistribution,
        migrationAnomalies: { count: anomalyCount, columns: anomalyColumns, codes: anomalyCodes },
      },
      alterRisks,
      findings,
      summary: {
        blocking: findings.filter(item => item.severity === "BLOCKING").length,
        warnings: findings.filter(item => item.severity === "WARNING").length,
      },
      redaction: "Aggregate counts and schema metadata only; no row IDs or sensitive field values selected.",
    };

    if (format === "json" || format === "both") console.log(JSON.stringify(report, null, 2));
    if (format === "both") console.log("\n---MARKDOWN---\n");
    if (format === "markdown" || format === "both") console.log(toMarkdown(report));
    process.exitCode = report.summary.blocking > 0 ? 3 : 0;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`A2 preflight failed safely: ${safeError(error)}`);
  process.exit(1);
});
