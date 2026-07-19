import { createHash } from "node:crypto";

export const MIGRATION_VERSION = "v3.3-a2.0.0";
export const SOURCE_BASELINE = "v3.2.4+migrations-0000-0014";
export const MANIFEST_CHECKSUM =
  "95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983";
export const BACKFILL_BATCH_SIZE = 500;
export const LOCK_WAIT_SECONDS = 5;
export const LOCK_RETRY_DELAYS_MS = [200, 500, 1000] as const;

export type AnomalySeverity = "INFO" | "WARNING" | "BLOCKING";
export type AnomalyHandling =
  | "CONTINUE"
  | "MIN_PRIVILEGE"
  | "SKIP_ENTITY"
  | "MANUAL_REVIEW"
  | "ABORT_RUN";

export const ANOMALY_CATALOG = {
  "MIG-SOURCE-BASELINE-MISMATCH": ["BLOCKING", "ABORT_RUN"],
  "MIG-SEED-MANIFEST-MISMATCH": ["BLOCKING", "ABORT_RUN"],
  "MIG-MISSING-USER": ["BLOCKING", "ABORT_RUN"],
  "MIG-ORPHAN-DOCUMENT": ["BLOCKING", "ABORT_RUN"],
  "MIG-STATE-CONFLICT": ["WARNING", "MIN_PRIVILEGE"],
  "MIG-REVIEWER-UNKNOWN": ["WARNING", "MANUAL_REVIEW"],
  "MIG-UNMAPPED-LEGACY-ROLE": ["WARNING", "MIN_PRIVILEGE"],
  "MIG-CROSS-SCOPE-RELATION": ["BLOCKING", "ABORT_RUN"],
  "MIG-DUPLICATE-OPEN-RELATION": ["BLOCKING", "ABORT_RUN"],
  "MIG-CHECKPOINT-CHECKSUM-MISMATCH": ["BLOCKING", "ABORT_RUN"],
  "MIG-ANOMALY-DETAIL-UNSAFE": ["BLOCKING", "ABORT_RUN"],
  "MIG-DOWNSTREAM-REFERENCE-PRESENT": ["BLOCKING", "ABORT_RUN"],
  "MIG-INVALID-LEGACY-JSON": ["WARNING", "SKIP_ENTITY"],
  "MIG-LOCK-RETRY-EXHAUSTED": ["BLOCKING", "ABORT_RUN"],
} as const satisfies Record<string, readonly [AnomalySeverity, AnomalyHandling]>;

export type AnomalyCode = keyof typeof ANOMALY_CATALOG;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export const CONFIGURATION = {
  anomalyCatalog: ANOMALY_CATALOG,
  batchSize: BACKFILL_BATCH_SIZE,
  checkpointShard: "000000",
  lockRetryDelaysMs: LOCK_RETRY_DELAYS_MS,
  lockWaitSeconds: LOCK_WAIT_SECONDS,
  migrationVersion: MIGRATION_VERSION,
  sourceBaseline: SOURCE_BASELINE,
} as const;

export const CONFIGURATION_CHECKSUM = sha256(canonicalJson(CONFIGURATION));

function compactUtc(instant: Date): string {
  if (Number.isNaN(instant.valueOf())) throw new Error("Invalid migration start time");
  return instant.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

export function createMigrationRunId(input: {
  startedAt: Date;
  runSequence: number;
  sourceChecksum: string;
  manifestChecksum?: string;
}): string {
  const startedAt = input.startedAt.toISOString();
  const suffix = sha256(
    [
      MIGRATION_VERSION,
      SOURCE_BASELINE,
      input.sourceChecksum,
      input.manifestChecksum ?? MANIFEST_CHECKSUM,
      startedAt,
      input.runSequence,
    ].join("|"),
  ).slice(0, 12);
  return `v33a2-${compactUtc(input.startedAt)}-${suffix}`;
}

export function checkpointKey(
  phase: "backfill" | "validate" | "recovery",
  entityType: string,
  rangeStartExclusive: string | number | null,
): string {
  return `${phase}|${entityType}|000000|${rangeStartExclusive ?? "BEGIN"}`;
}

const unsafeKey = /(phone|email|address|idnumber|registrationno(?!last4)|bank|token|secret|password|storagekey|url|filename|content|description|reason)$/i;
const unsafeValue = /(?:https?:\/\/|-----BEGIN|\b(?:token|secret|password)\s*[:=])/i;
const allowedKeys = new Set([
  "sourceTable",
  "entityId",
  "fieldName",
  "expected",
  "actualEnum",
  "count",
  "ruleCode",
  "digest",
  "last4",
  "projectId",
  "milestoneId",
  "verificationType",
]);

export function assertSafeAnomalyDetail(detail: Record<string, unknown>): void {
  const visit = (value: unknown, key?: string): void => {
    if (key && (unsafeKey.test(key) || !allowedKeys.has(key))) {
      throw new Error(`MIG-ANOMALY-DETAIL-UNSAFE:${key}`);
    }
    if (typeof value === "string" && unsafeValue.test(value)) {
      throw new Error(`MIG-ANOMALY-DETAIL-UNSAFE:${key ?? "value"}`);
    }
    if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, item]) => visit(item, childKey));
    }
  };
  visit(detail);
}

export function anomalyRecord(input: {
  migrationRunId: string;
  sourceChecksum: string;
  checkpointKey?: string;
  entityType: string;
  entityId?: number;
  code: AnomalyCode;
  detail: Record<string, unknown>;
}) {
  assertSafeAnomalyDetail(input.detail);
  const detailChecksum = sha256(canonicalJson(input.detail));
  const [severity, handling] = ANOMALY_CATALOG[input.code];
  const fingerprint = sha256(
    [
      MIGRATION_VERSION,
      SOURCE_BASELINE,
      input.entityType,
      input.entityId ?? "-",
      input.code,
      detailChecksum,
    ].join("|"),
  );
  return { ...input, migrationVersion: MIGRATION_VERSION, severity, handling, fingerprint, detailChecksum };
}

const allowedDatabaseMarkers = ["v33a2_empty", "v33_a2_empty", "test_v33a2"];
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertSafeMigrationDatabase(databaseUrl: string | undefined): URL {
  if (!databaseUrl) throw new Error("DATABASE_URL must be explicitly set");
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();
  if (!databaseName || !allowedDatabaseMarkers.some((marker) => databaseName.includes(marker))) {
    throw new Error(`Unsafe database name: ${databaseName || "<empty>"}`);
  }
  if (!localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Remote database hosts are forbidden: ${parsed.hostname}`);
  }
  return parsed;
}
