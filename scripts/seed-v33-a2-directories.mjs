import mysql from "mysql2/promise";

import {
  A2_EXPECTED_COUNTS,
  assertSafeA2DatabaseUrl,
  canonicalJson,
  loadVerifiedManifest,
} from "./lib/v33-a2-contract.mjs";

const TABLES = [
  {
    manifestKey: "identityTypes",
    table: "identity_types",
    columns: [
      "code",
      "name",
      "description",
      "requiresCertification",
      "isSystem",
      "status",
    ],
    normalize(row) {
      return {
        code: row.code,
        name: row.name,
        description: row.description,
        requiresCertification: Boolean(row.requiresCertification),
        isSystem: Boolean(row.isSystem),
        status: row.status,
      };
    },
  },
  {
    manifestKey: "certificationTypes",
    table: "certification_types",
    columns: [
      "code",
      "name",
      "subjectType",
      "reviewMode",
      "validityDays",
      "sensitiveLevel",
      "requirements",
      "status",
    ],
    normalize(row) {
      let requirements = row.requirements;
      if (typeof requirements === "string") {
        requirements = JSON.parse(requirements);
      }
      return { ...row, requirements };
    },
  },
  {
    manifestKey: "capabilities",
    table: "capabilities",
    columns: [
      "code",
      "domain",
      "name",
      "description",
      "riskLevel",
      "defaultAuditMode",
      "status",
      "replacementCode",
    ],
    normalize(row) {
      return row;
    },
  },
  {
    manifestKey: "projectRoles",
    table: "project_roles",
    columns: ["code", "name", "description", "isSystem", "status"],
    normalize(row) {
      return { ...row, isSystem: Boolean(row.isSystem) };
    },
  },
];

function placeholders(rowCount, columnCount) {
  const row = `(${Array.from({ length: columnCount }, () => "?").join(",")})`;
  return Array.from({ length: rowCount }, () => row).join(",");
}

function compareDefinition(expected, actual, table) {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    const error = new Error(
      `Published code definition drift: ${table}.${expected.code}`,
    );
    error.code = "MIG-SEED-PUBLISHED-CODE-DRIFT";
    error.severity = "BLOCKING";
    error.handling = "ABORT_RUN";
    throw error;
  }
}

async function seedTable(connection, seedData, contract) {
  const expectedRows = seedData[contract.manifestKey];
  const codes = expectedRows.map((row) => row.code);
  const codePlaceholders = codes.map(() => "?").join(",");
  const selectColumns = contract.columns
    .map((column) => `\`${column}\``)
    .join(",");
  const [beforeRows] = await connection.query(
    `SELECT ${selectColumns} FROM \`${contract.table}\` WHERE \`code\` IN (${codePlaceholders}) FOR UPDATE`,
    codes,
  );
  const existingByCode = new Map(
    beforeRows.map((row) => [row.code, contract.normalize(row)]),
  );
  for (const expected of expectedRows) {
    const existing = existingByCode.get(expected.code);
    if (existing) {
      compareDefinition(expected, existing, contract.table);
    }
  }

  const missing = expectedRows.filter((row) => !existingByCode.has(row.code));
  if (missing.length > 0) {
    const flattened = missing.flatMap((row) =>
      contract.columns.map((column) => row[column]),
    );
    await connection.query(
      `INSERT INTO \`${contract.table}\` (${selectColumns}) VALUES ${placeholders(
        missing.length,
        contract.columns.length,
      )} ON DUPLICATE KEY UPDATE \`code\` = \`code\``,
      flattened,
    );
  }

  const [afterRows] = await connection.query(
    `SELECT ${selectColumns} FROM \`${contract.table}\` WHERE \`code\` IN (${codePlaceholders})`,
    codes,
  );
  const afterByCode = new Map(
    afterRows.map((row) => [row.code, contract.normalize(row)]),
  );
  for (const expected of expectedRows) {
    const actual = afterByCode.get(expected.code);
    if (!actual) {
      throw new Error(
        `Seed insert missing after transaction: ${contract.table}.${expected.code}`,
      );
    }
    compareDefinition(expected, actual, contract.table);
  }
  const [[total]] = await connection.query(
    `SELECT COUNT(*) AS count FROM \`${contract.table}\``,
  );
  if (Number(total.count) !== A2_EXPECTED_COUNTS[contract.manifestKey]) {
    throw new Error(
      `Frozen directory count mismatch for ${contract.table}: expected ${
        A2_EXPECTED_COUNTS[contract.manifestKey]
      }, got ${total.count}`,
    );
  }
  return Number(total.count);
}

async function main() {
  const { manifest, seedData, result } = await loadVerifiedManifest();
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
    return;
  }
  const { databaseName } = assertSafeA2DatabaseUrl(process.env.DATABASE_URL);
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.beginTransaction();
    const counts = {};
    for (const contract of TABLES) {
      counts[contract.manifestKey] = await seedTable(
        connection,
        seedData,
        contract,
      );
    }
    await connection.commit();
    console.log(
      JSON.stringify({
        status: "PASS",
        databaseName,
        manifestVersion: manifest.manifestVersion,
        migrationVersion: manifest.migrationVersion,
        manifestChecksum: result.checksum,
        seedDataChecksum: result.seedDataChecksum,
        counts,
      }),
    );
  } catch (error) {
    await connection.rollback();
    console.error(
      JSON.stringify({
        status: "FAIL",
        severity: error.severity ?? "BLOCKING",
        handling: error.handling ?? "ABORT_RUN",
        code: error.code ?? "MIG-SEED-EXECUTION-FAILED",
        message: error.message,
      }),
    );
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

await main();
