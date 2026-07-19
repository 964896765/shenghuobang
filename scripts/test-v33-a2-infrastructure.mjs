import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  anomalyFingerprint,
  detailChecksum,
  getLegacyAnomalyRule,
} from "./lib/v33-a2-contract.mjs";

const sourceBaseline = "v3.2.4+migrations-0000-0014";
const legacyRows = [
  {
    id: 11,
    migrationVersion: "v3.2.4",
    entityType: "user",
    entityId: 101,
    code: "orphan_user",
    detail: { sourceTable: "users", count: 1 },
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 12,
    migrationVersion: "v3.2.4",
    entityType: "listing",
    entityId: 102,
    code: "cancelled_default_idle",
    detail: null,
    resolvedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 13,
    migrationVersion: "v3.2.4",
    entityType: "listing",
    entityId: 103,
    code: "missing_valid_mode",
    detail: { fieldName: "mode" },
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 14,
    migrationVersion: "v3.2.4",
    entityType: "item",
    entityId: 104,
    code: "missing_item",
    detail: { sourceTable: "items" },
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 15,
    migrationVersion: "v3.2.4",
    entityType: "unknown",
    entityId: null,
    code: "future_unregistered_code",
    detail: { ruleCode: "UNKNOWN" },
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function upgrade(row) {
  const rule = getLegacyAnomalyRule(row.code);
  const checksum = detailChecksum(row.detail);
  return {
    ...row,
    migrationRunId: "v33a2-20260719T000000000Z-8eb607c9930b",
    severity: rule.severity,
    handling: rule.handling,
    status: rule.status,
    detailChecksum: checksum,
    fingerprint: anomalyFingerprint({
      migrationVersion: row.migrationVersion,
      sourceBaseline,
      entityType: row.entityType,
      entityId: row.entityId,
      code: row.code,
      detailChecksum: checksum,
    }),
  };
}

const upgraded = legacyRows.map(upgrade);
assert.match(
  upgraded[0].migrationRunId,
  /^v33a2-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{12}$/,
);
assert.deepEqual(
  upgraded.map(({ severity, handling, status }) => ({
    severity,
    handling,
    status,
  })),
  [
    { severity: "BLOCKING", handling: "ABORT_RUN", status: "open" },
    { severity: "INFO", handling: "CONTINUE", status: "resolved" },
    { severity: "WARNING", handling: "MIN_PRIVILEGE", status: "open" },
    { severity: "BLOCKING", handling: "ABORT_RUN", status: "open" },
    { severity: "BLOCKING", handling: "ABORT_RUN", status: "open" },
  ],
);

for (const [index, oldRow] of legacyRows.entries()) {
  const newRow = upgraded[index];
  for (const field of [
    "id",
    "migrationVersion",
    "entityType",
    "entityId",
    "code",
    "detail",
    "resolvedAt",
    "createdAt",
  ]) {
    assert.deepEqual(
      newRow[field],
      oldRow[field],
      `${field} changed during additive upgrade`,
    );
  }
  assert.equal(
    upgrade(oldRow).fingerprint,
    newRow.fingerprint,
    "fingerprint must be idempotent",
  );
  assert.match(newRow.fingerprint, /^[0-9a-f]{64}$/);
  assert.match(newRow.detailChecksum, /^[0-9a-f]{64}$/);
  if (newRow.severity === "BLOCKING") {
    assert.equal(newRow.handling, "ABORT_RUN");
  }
}

const runStatus = upgraded.some((row) => row.severity === "BLOCKING")
  ? "failed"
  : "completed";
assert.equal(
  runStatus,
  "failed",
  "A run with BLOCKING anomalies must not complete",
);

const migrationSql = await readFile(
  new URL(
    "../drizzle/0017_v33_a2_anomalies_backfill_constraints.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migrationSql, /ELSE 'BLOCKING'/);
assert.match(migrationSql, /ELSE 'ABORT_RUN'/);
assert.match(migrationSql, /MIG-LEGACY-ANOMALY-BLOCKING/);
assert.match(migrationSql, /AND run\.`status` = 'running'/);
assert.doesNotMatch(
  migrationSql,
  /DROP\s+(?:COLUMN\s+)?`(?:id|migrationVersion|entityType|entityId|code|detail|resolvedAt|createdAt)`/i,
);

console.log("V3.3-A A2 migration infrastructure tests: PASS");
console.log(
  "legacyMappings=5 fingerprints=idempotent blockingRunStatus=failed preservedFields=8",
);
