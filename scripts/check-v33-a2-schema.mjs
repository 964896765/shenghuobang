import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadVerifiedManifest } from "./lib/v33-a2-contract.mjs";

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function contains(source, fragment, context) {
  check(source.includes(fragment), `${context}: missing ${fragment}`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const [schema, journalRaw, snapshotRaw, a20Report, manifestResult] =
  await Promise.all([
    read("drizzle/schema.ts"),
    read("drizzle/meta/_journal.json"),
    read("drizzle/meta/0020_snapshot.json"),
    read("docs/execution/v3.3-a-a2/A2_0_DATABASE_FACT_REPORT.md"),
    loadVerifiedManifest(),
  ]);
const journal = JSON.parse(journalRaw);
const snapshot = JSON.parse(snapshotRaw);
const sqlFiles = (await readdir(path.join(root, "drizzle")))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const a21Files = sqlFiles.filter((file) => /^00(1[5-9]|20)_/.test(file));
const a21Sql = Object.fromEntries(
  await Promise.all(
    a21Files.map(async (file) => [file, await read(`drizzle/${file}`)]),
  ),
);

check(
  (schema.match(/mysqlTable\(/g) ?? []).length >= 75,
  "Schema must retain at least the 75 tables present after A2.1",
);
for (const table of [
  "migration_runs",
  "migration_checkpoints",
  "migration_anomalies",
  "identity_types",
  "certification_types",
  "capabilities",
  "project_roles",
]) {
  check(
    (schema.match(new RegExp(`mysqlTable\\(\\s*[\"']${table}[\"']`, "g")) ?? [])
      .length === 1,
    `Schema must define ${table} exactly once`,
  );
}

const expectedTableShape = {
  migration_runs: { columns: 25, indexes: 4, foreignKeys: 2 },
  migration_checkpoints: { columns: 24, indexes: 3, foreignKeys: 1 },
  migration_anomalies: { columns: 17, indexes: 4, foreignKeys: 2 },
  identity_types: { columns: 10, indexes: 2, foreignKeys: 0 },
  certification_types: { columns: 12, indexes: 2, foreignKeys: 0 },
  capabilities: { columns: 11, indexes: 1, foreignKeys: 1 },
  project_roles: { columns: 8, indexes: 0, foreignKeys: 0 },
};
for (const [table, expected] of Object.entries(expectedTableShape)) {
  const actual = snapshot.tables[table];
  check(Boolean(actual), `0020 snapshot is missing ${table}`);
  if (!actual) continue;
  for (const key of ["columns", "indexes", "foreignKeys"]) {
    check(
      Object.keys(actual[key]).length === expected[key],
      `${table} ${key} expected ${expected[key]}, found ${Object.keys(actual[key]).length}`,
    );
  }
}
for (const [table, column, type, notNull] of [
  ["migration_runs", "migrationRunId", "varchar(64)", true],
  ["migration_runs", "sourceChecksum", "char(64)", true],
  ["migration_runs", "createdAt", "timestamp(3)", true],
  ["migration_checkpoints", "checkpointKey", "varchar(191)", true],
  ["migration_checkpoints", "batchSize", "int", true],
  ["migration_anomalies", "migrationRunId", "varchar(64)", true],
  ["migration_anomalies", "fingerprint", "char(64)", true],
  ["migration_anomalies", "resolvedByAccountId", "int", false],
  ["identity_types", "requiresCertification", "boolean", true],
  ["certification_types", "requirements", "json", false],
  ["capabilities", "code", "varchar(128)", true],
  ["project_roles", "code", "varchar(64)", true],
]) {
  const actual = snapshot.tables[table]?.columns[column];
  check(
    actual?.type === type,
    `${table}.${column} type expected ${type}, found ${actual?.type}`,
  );
  check(
    actual?.notNull === notNull,
    `${table}.${column} notNull expected ${notNull}, found ${actual?.notNull}`,
  );
}

for (const fragment of [
  'migrationRunId: varchar("migrationRunId", { length: 64 })',
  'sourceChecksum: char("sourceChecksum", { length: 64 }).notNull()',
  'manifestChecksum: char("manifestChecksum", { length: 64 }).notNull()',
  'configurationChecksum: char("configurationChecksum"',
  'checkpointKey: varchar("checkpointKey", { length: 191 }).notNull()',
  'batchSize: int("batchSize").notNull()',
  'severity: mysqlEnum("severity", ["INFO", "WARNING", "BLOCKING"]).notNull()',
  'fingerprint: char("fingerprint", { length: 64 }).notNull()',
  'detailChecksum: char("detailChecksum", { length: 64 }).notNull()',
  "migration_anomalies_run_fingerprint_uq",
  "migration_anomalies_blocking_handling_ck",
  "capabilities_replacement_fk",
]) {
  contains(schema, fragment, "Schema contract");
}

check(
  a21Files.length === 6,
  `Expected six A2.1 migrations, found ${a21Files.length}`,
);
const expectedSuffixes = [
  "migration_runs_checkpoints",
  "anomalies_additive",
  "anomalies_backfill_constraints",
  "identity_certification_directories",
  "capability_project_role_directories",
  "frozen_directory_seeds",
];
expectedSuffixes.forEach((suffix, index) => {
  check(
    a21Files[index]?.includes(suffix),
    `Migration ${15 + index} must be the ${suffix} stop point`,
  );
});

const sql15 = a21Sql[a21Files[0]] ?? "";
const sql16 = a21Sql[a21Files[1]] ?? "";
const sql17 = a21Sql[a21Files[2]] ?? "";
const sql18 = a21Sql[a21Files[3]] ?? "";
const sql19 = a21Sql[a21Files[4]] ?? "";
const sql20 = a21Sql[a21Files[5]] ?? "";
check(
  sql15.indexOf("CREATE TABLE `migration_runs`") <
    sql15.indexOf("CREATE TABLE `migration_checkpoints`"),
  "0015 must create migration_runs before migration_checkpoints",
);
check(
  (sql15.match(/CREATE TABLE/g) ?? []).length === 2,
  "0015 must create exactly two tables",
);
check(
  (sql16.match(/ ADD `/g) ?? []).length === 9,
  "0016 must add exactly nine nullable anomaly columns",
);
check(
  !/CREATE TABLE|DROP TABLE|NOT NULL/.test(sql16),
  "0016 must be additive nullable upgrade only",
);
for (const oldColumn of [
  "id",
  "migrationVersion",
  "entityType",
  "entityId",
  "code",
  "detail",
  "resolvedAt",
  "createdAt",
]) {
  check(
    !new RegExp("DROP(?: COLUMN)? `" + oldColumn + "`").test(sql16 + sql17),
    `Old anomaly ${oldColumn} must be preserved`,
  );
}
for (const code of [
  "orphan_user",
  "cancelled_default_idle",
  "missing_valid_mode",
  "missing_item",
]) {
  contains(sql17, `WHEN '${code}'`, "0017 frozen anomaly mapping");
}
for (const fragment of [
  "v33a2-20260719T000000000Z-8eb607c9930b",
  "v3.3-a2.0.0",
  "v3.2.4+migrations-0000-0014",
  "95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983",
  "ELSE 'BLOCKING'",
  "ELSE 'ABORT_RUN'",
  "migration_anomalies_run_fingerprint_uq",
  "migration_anomalies_blocking_handling_ck",
  "AND run.`status` = 'running'",
  "'failed'",
  "'completed'",
]) {
  contains(sql17, fragment, "0017 anomaly upgrade");
}
check(
  (sql18.match(/CREATE TABLE/g) ?? []).length === 2,
  "0018 must create two type directories",
);
contains(sql18, "CREATE TABLE `identity_types`", "0018");
contains(sql18, "CREATE TABLE `certification_types`", "0018");
check(
  (sql19.match(/CREATE TABLE/g) ?? []).length === 2,
  "0019 must create two capability directories",
);
contains(sql19, "CREATE TABLE `capabilities`", "0019");
contains(sql19, "CREATE TABLE `project_roles`", "0019");
contains(
  sql20,
  manifestResult.result.checksum ?? "__invalid_manifest__",
  "0020 manifest checksum",
);
check(
  !/\b(UUID|RAND|NOW|CURRENT_TIMESTAMP)\s*\(|requestId/i.test(sql20),
  "0020 manifest seed must not use nondeterministic inputs",
);
check(
  (sql20.match(/BINARY /g) ?? []).length === 54,
  "0020 must compare all published fields byte-for-byte",
);
contains(
  sql20,
  "seedDataSha256: bcf102f7d379424bba5e8dd025c3e5563531111489097c162716c6b3b4a348bb",
  "0020 seed data checksum",
);
for (const [file, sql] of Object.entries(a21Sql)) {
  check(
    !/^(?:\+--|<<<<<<<|=======|>>>>>>>)/m.test(sql),
    `${file} contains a patch/conflict marker`,
  );
}
for (const key of Object.keys(manifestResult.seedData)) {
  if (!Array.isArray(manifestResult.seedData[key])) continue;
  for (const row of manifestResult.seedData[key]) {
    contains(sql20, `'${row.code}'`, `0020 ${key}`);
  }
}
check(
  manifestResult.result.ok,
  `Manifest verification failed: ${manifestResult.result.code}`,
);

check(
  journal.entries.length >= 21,
  `Journal must retain at least 21 entries, found ${journal.entries.length}`,
);
for (let index = 0; index < journal.entries.length; index += 1) {
  check(
    journal.entries[index].idx === index,
    `Journal idx ${index} is not continuous`,
  );
  check(
    `${journal.entries[index].tag}.sql` === sqlFiles[index],
    `Journal tag/file mismatch at idx ${index}`,
  );
}

const baselineRows = [
  ...a20Report.matchAll(
    /\| `(00(?:0\d|1[0-4])_[^`]+\.sql)` \| (\d+) \| `([0-9a-f]{64})` \|/g,
  ),
];
check(
  baselineRows.length === 15,
  `A2.0 baseline report must expose 15 hashes, found ${baselineRows.length}`,
);
for (const [, file, bytesText, expectedHash] of baselineRows) {
  const buffer = await readFile(path.join(root, "drizzle", file));
  check(
    buffer.length === Number(bytesText),
    `${file} byte length changed from A2.0 baseline`,
  );
  check(
    sha256(buffer) === expectedHash,
    `${file} SHA-256 changed from A2.0 baseline`,
  );
}

if (failures.length > 0) {
  console.error(`V3.3-A A2 schema contract: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("V3.3-A A2 schema contract: PASS");
  console.log(
    "a21TablesRetained=75 baseline=69 new=6 upgraded=1 migrations=0015..0020 journal>=21",
  );
  console.log(`manifestSha256=${manifestResult.result.checksum}`);
  console.log(`seedDataSha256=${manifestResult.result.seedDataChecksum}`);
}
