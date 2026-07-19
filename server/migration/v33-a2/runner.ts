import {
  ANOMALY_CATALOG,
  BACKFILL_BATCH_SIZE,
  CONFIGURATION_CHECKSUM,
  MANIFEST_CHECKSUM,
  MIGRATION_VERSION,
  SOURCE_BASELINE,
  anomalyRecord,
  canonicalJson,
  checkpointKey,
  createMigrationRunId,
  sha256,
  type AnomalyCode,
} from "./contract";
import { planLegacyBackfill, type LegacyFixture, type PlannedAnomaly } from "./planner";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type RunMode = "migrate" | "rerun" | "recovery";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "aborted";
export type CheckpointStatus = "running" | "completed" | "failed";
export type BackfillEntity =
  | "business_identities"
  | "identity_profiles"
  | "certifications"
  | "certification_documents"
  | "certification_review_actions"
  | "project_memberships"
  | "platform_staff_positions"
  | "workspace_preferences";

export interface MigrationRunRecord {
  migrationRunId: string;
  migrationVersion: string;
  sourceBaseline: string;
  sourceChecksum: string;
  manifestChecksum: string;
  configurationChecksum: string;
  runMode: RunMode;
  parentMigrationRunId: string | null;
  runSequence: number;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface RecoveryTargetMap {
  [tableName: string]: number[];
}

export interface MigrationCheckpointRecord {
  migrationRunId: string;
  checkpointKey: string;
  phase: "backfill" | "validate" | "recovery";
  entityType: string;
  rangeStartExclusive: string | null;
  rangeEndInclusive: string | null;
  status: CheckpointStatus;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  checksum: string;
  targets: RecoveryTargetMap;
}

export interface BatchMutationResult {
  succeededCount: number;
  skippedCount: number;
  targets: RecoveryTargetMap;
}

export interface CommitBatchInput {
  run: MigrationRunRecord;
  entityType: BackfillEntity;
  checkpoint: Omit<MigrationCheckpointRecord, "status" | "succeededCount" | "failedCount" | "skippedCount" | "targets">;
  rows: readonly unknown[];
}

export interface MigrationStore {
  nextRunSequence(migrationVersion: string, sourceBaseline: string): Promise<number>;
  createRun(run: MigrationRunRecord): Promise<void>;
  getRun(migrationRunId: string): Promise<MigrationRunRecord | null>;
  updateRun(run: MigrationRunRecord): Promise<void>;
  getCheckpoint(migrationRunId: string, key: string): Promise<MigrationCheckpointRecord | null>;
  listCheckpoints(migrationRunId: string): Promise<MigrationCheckpointRecord[]>;
  commitBatch(input: CommitBatchInput): Promise<BatchMutationResult>;
  failCheckpoint(checkpoint: MigrationCheckpointRecord): Promise<void>;
  writeAnomalies(migrationRunId: string, anomalies: readonly PlannedAnomaly[]): Promise<void>;
  listAnomalies(migrationRunId: string): Promise<PlannedAnomaly[]>;
  recoverTargets(targets: RecoveryTargetMap): Promise<{ recoveredCount: number }>;
}

export interface RunResult {
  run: MigrationRunRecord;
  checkpoints: MigrationCheckpointRecord[];
  anomalies: PlannedAnomaly[];
  recoveredCount?: number;
}

export class SimulatedDisconnectError extends Error {
  constructor() {
    super("SIMULATED_STREAM_DISCONNECT");
  }
}

function iso(instant: Date): string {
  return instant.toISOString();
}

function sourceRowKey(row: unknown, fallback: number): string {
  if (!row || typeof row !== "object") return String(fallback);
  const value = row as Record<string, unknown>;
  for (const key of ["legacyId", "legacySourceId", "projectId", "accountId", "id"]) {
    if (value[key] !== undefined && value[key] !== null) return String(value[key]);
  }
  return String(fallback);
}

function chunks<T>(rows: readonly T[]): T[][] {
  if (rows.length === 0) return [[]];
  const result: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += BACKFILL_BATCH_SIZE) {
    result.push(rows.slice(offset, offset + BACKFILL_BATCH_SIZE));
  }
  return result;
}

function checkpointChecksum(entityType: string, rows: readonly unknown[]) {
  return sha256(canonicalJson({ entityType, rows }));
}

export function certificationActiveDedupeKey(
  status: string,
  subject: { kind: "identity" | "organization"; id: number },
  certificationTypeId: number,
): string | null {
  return ["pending", "additional_info_required", "approved"].includes(status)
    ? `cert|${subject.kind}:${subject.id}|${certificationTypeId}`
    : null;
}

function emptyRun(input: {
  migrationRunId: string;
  runMode: RunMode;
  parentMigrationRunId?: string | null;
  runSequence: number;
  sourceChecksum: string;
  startedAt: Date;
}): MigrationRunRecord {
  return {
    migrationRunId: input.migrationRunId,
    migrationVersion: MIGRATION_VERSION,
    sourceBaseline: SOURCE_BASELINE,
    sourceChecksum: input.sourceChecksum,
    manifestChecksum: MANIFEST_CHECKSUM,
    configurationChecksum: CONFIGURATION_CHECKSUM,
    runMode: input.runMode,
    parentMigrationRunId: input.parentMigrationRunId ?? null,
    runSequence: input.runSequence,
    status: "running",
    startedAt: iso(input.startedAt),
    completedAt: null,
    failedAt: null,
    failureCode: null,
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };
}

function assertResumeContract(run: MigrationRunRecord, sourceChecksum: string) {
  if (run.status !== "running") throw new Error(`Only a running run can resume: ${run.status}`);
  if (
    run.migrationVersion !== MIGRATION_VERSION ||
    run.sourceBaseline !== SOURCE_BASELINE ||
    run.sourceChecksum !== sourceChecksum ||
    run.manifestChecksum !== MANIFEST_CHECKSUM ||
    run.configurationChecksum !== CONFIGURATION_CHECKSUM
  ) {
    throw new Error("MIG-SOURCE-BASELINE-MISMATCH");
  }
}

function aggregate(run: MigrationRunRecord, checkpoints: readonly MigrationCheckpointRecord[]) {
  run.processedCount = checkpoints.reduce((sum, item) => sum + item.processedCount, 0);
  run.succeededCount = checkpoints.reduce((sum, item) => sum + item.succeededCount, 0);
  run.failedCount = checkpoints.reduce((sum, item) => sum + item.failedCount, 0);
  run.skippedCount = checkpoints.reduce((sum, item) => sum + item.skippedCount, 0);
}

export class MigrationRunner {
  constructor(
    private readonly store: MigrationStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async migrate(
    fixture: LegacyFixture,
    input: {
      sourceChecksum: string;
      runMode?: "migrate" | "rerun";
      parentMigrationRunId?: string;
      resumeMigrationRunId?: string;
      afterCheckpoint?: (checkpoint: MigrationCheckpointRecord) => void | Promise<void>;
    },
  ): Promise<RunResult> {
    let run: MigrationRunRecord;
    if (input.resumeMigrationRunId) {
      const existing = await this.store.getRun(input.resumeMigrationRunId);
      if (!existing) throw new Error(`Unknown migrationRunId: ${input.resumeMigrationRunId}`);
      assertResumeContract(existing, input.sourceChecksum);
      run = existing;
    } else {
      const runMode = input.runMode ?? "migrate";
      if (runMode === "rerun") {
        if (!input.parentMigrationRunId) throw new Error("rerun requires an explicit parentMigrationRunId");
        const parent = await this.store.getRun(input.parentMigrationRunId);
        if (!parent || !["failed", "aborted", "completed"].includes(parent.status)) {
          throw new Error("rerun parent must be an explicit terminal run");
        }
      }
      const startedAt = this.clock();
      const runSequence = await this.store.nextRunSequence(MIGRATION_VERSION, SOURCE_BASELINE);
      const migrationRunId = createMigrationRunId({
        startedAt,
        runSequence,
        sourceChecksum: input.sourceChecksum,
      });
      run = emptyRun({ migrationRunId, runMode, parentMigrationRunId: input.parentMigrationRunId, runSequence, sourceChecksum: input.sourceChecksum, startedAt });
      await this.store.createRun(run);
    }

    const plan = planLegacyBackfill(fixture, {
      migrationRunId: run.migrationRunId,
      sourceChecksum: input.sourceChecksum,
    });
    const blocking = plan.anomalies.filter((item) => item.severity === "BLOCKING");
    await this.store.writeAnomalies(run.migrationRunId, plan.anomalies);

    if (blocking.length > 0) {
      const key = checkpointKey("validate", "blocking_anomalies", null);
      const failedCheckpoint: MigrationCheckpointRecord = {
        migrationRunId: run.migrationRunId,
        checkpointKey: key,
        phase: "validate",
        entityType: "blocking_anomalies",
        rangeStartExclusive: null,
        rangeEndInclusive: null,
        status: "failed",
        processedCount: blocking.length,
        succeededCount: 0,
        failedCount: blocking.length,
        skippedCount: 0,
        checksum: sha256(canonicalJson(blocking.map((item) => item.fingerprint))),
        targets: {},
      };
      await this.store.failCheckpoint(failedCheckpoint);
      run.status = "failed";
      run.failedAt = iso(this.clock());
      run.failureCode = blocking[0].code;
      aggregate(run, await this.store.listCheckpoints(run.migrationRunId));
      await this.store.updateRun(run);
      return this.result(run);
    }

    const entities: Array<[BackfillEntity, readonly unknown[]]> = [
      ["business_identities", plan.identities],
      ["identity_profiles", plan.profiles],
      ["certifications", plan.certifications],
      ["certification_documents", plan.certificationDocuments],
      ["certification_review_actions", plan.certificationReviewActions],
      ["project_memberships", plan.memberships],
      ["platform_staff_positions", plan.platformPositions],
      ["workspace_preferences", plan.workspacePreferences],
    ];

    try {
      for (const [entityType, rows] of entities) {
        let previous: string | null = null;
        let offset = 0;
        for (const batch of chunks(rows)) {
          const firstKey = batch.length > 0 ? sourceRowKey(batch[0], offset + 1) : null;
          const lastKey = batch.length > 0 ? sourceRowKey(batch[batch.length - 1], offset + batch.length) : null;
          const key = checkpointKey("backfill", entityType, previous);
          const checksum = checkpointChecksum(entityType, batch);
          const existing = await this.store.getCheckpoint(run.migrationRunId, key);
          if (existing?.status === "completed") {
            if (existing.checksum !== checksum) {
              const mismatch = anomalyRecord({
                migrationRunId: run.migrationRunId,
                sourceChecksum: input.sourceChecksum,
                checkpointKey: key,
                entityType: "migration_checkpoint",
                code: "MIG-CHECKPOINT-CHECKSUM-MISMATCH",
                detail: { sourceTable: entityType, fieldName: "checksum", expected: existing.checksum, digest: checksum, ruleCode: "EXACT_MATCH" },
              });
              await this.store.writeAnomalies(run.migrationRunId, [mismatch]);
              const failed = { ...existing, status: "failed" as const, failedCount: Math.max(existing.failedCount, 1) };
              failed.processedCount = failed.succeededCount + failed.failedCount + failed.skippedCount;
              await this.store.failCheckpoint(failed);
              throw new Error("MIG-CHECKPOINT-CHECKSUM-MISMATCH");
            }
            previous = lastKey ?? previous;
            offset += batch.length;
            continue;
          }
          const checkpointBase = {
            migrationRunId: run.migrationRunId,
            checkpointKey: key,
            phase: "backfill" as const,
            entityType,
            rangeStartExclusive: previous,
            rangeEndInclusive: lastKey ?? firstKey,
            processedCount: batch.length,
            checksum,
          };
          const mutation = await this.store.commitBatch({ run, entityType, checkpoint: checkpointBase, rows: batch });
          const committed: MigrationCheckpointRecord = {
            ...checkpointBase,
            status: "completed",
            succeededCount: mutation.succeededCount,
            failedCount: 0,
            skippedCount: mutation.skippedCount,
            targets: mutation.targets,
          };
          await input.afterCheckpoint?.(committed);
          previous = lastKey ?? previous;
          offset += batch.length;
        }
      }
      aggregate(run, await this.store.listCheckpoints(run.migrationRunId));
      run.status = "completed";
      run.completedAt = iso(this.clock());
      run.failedAt = null;
      run.failureCode = null;
      await this.store.updateRun(run);
      return this.result(run);
    } catch (error) {
      if (error instanceof SimulatedDisconnectError) throw error;
      run.status = "failed";
      run.failedAt = iso(this.clock());
      run.failureCode = error instanceof Error && error.message.startsWith("MIG-") ? error.message : "MIG-LOCK-RETRY-EXHAUSTED";
      aggregate(run, await this.store.listCheckpoints(run.migrationRunId));
      if (run.failedCount === 0) {
        run.processedCount += 1;
        run.failedCount += 1;
      }
      await this.store.updateRun(run);
      throw error;
    }
  }

  async recovery(input: {
    sourceChecksum: string;
    targetMigrationRunId: string;
    checkpointKey?: string;
    checkpointChecksum?: string;
  }): Promise<RunResult> {
    if (!input.targetMigrationRunId) throw new Error("recovery requires an explicit targetMigrationRunId");
    const targetRun = await this.store.getRun(input.targetMigrationRunId);
    if (!targetRun) throw new Error(`Unknown target migrationRunId: ${input.targetMigrationRunId}`);
    if (
      targetRun.migrationVersion !== MIGRATION_VERSION ||
      targetRun.sourceBaseline !== SOURCE_BASELINE ||
      targetRun.sourceChecksum !== input.sourceChecksum ||
      targetRun.manifestChecksum !== MANIFEST_CHECKSUM ||
      targetRun.configurationChecksum !== CONFIGURATION_CHECKSUM
    ) {
      throw new Error("MIG-SOURCE-BASELINE-MISMATCH");
    }
    const targetCheckpoints = await this.store.listCheckpoints(input.targetMigrationRunId);
    const selected = input.checkpointKey
      ? targetCheckpoints.filter((item) => item.checkpointKey === input.checkpointKey)
      : targetCheckpoints;
    if (input.checkpointKey && selected.length !== 1) throw new Error(`Unknown checkpointKey: ${input.checkpointKey}`);
    if (input.checkpointKey) {
      if (!input.checkpointChecksum || selected[0].checksum !== input.checkpointChecksum) {
        throw new Error("MIG-CHECKPOINT-CHECKSUM-MISMATCH");
      }
    }

    const startedAt = this.clock();
    const runSequence = await this.store.nextRunSequence(MIGRATION_VERSION, SOURCE_BASELINE);
    const migrationRunId = createMigrationRunId({ startedAt, runSequence, sourceChecksum: input.sourceChecksum });
    const run = emptyRun({ migrationRunId, runMode: "recovery", parentMigrationRunId: targetRun.migrationRunId, runSequence, sourceChecksum: input.sourceChecksum, startedAt });
    await this.store.createRun(run);

    const combined: RecoveryTargetMap = {};
    for (const checkpoint of [...selected].reverse()) {
      for (const [tableName, ids] of Object.entries(checkpoint.targets)) {
        combined[tableName] = [...(combined[tableName] ?? []), ...ids];
      }
    }
    try {
      const { recoveredCount } = await this.store.recoverTargets(combined);
      const recoveryKey = checkpointKey("recovery", "explicit_targets", input.checkpointKey ?? "BEGIN");
      const recoveryCheckpoint: MigrationCheckpointRecord = {
        migrationRunId,
        checkpointKey: recoveryKey,
        phase: "recovery",
        entityType: "explicit_targets",
        rangeStartExclusive: input.checkpointKey ?? null,
        rangeEndInclusive: input.targetMigrationRunId,
        status: "completed",
        processedCount: recoveredCount,
        succeededCount: recoveredCount,
        failedCount: 0,
        skippedCount: 0,
        checksum: sha256(canonicalJson(combined)),
        targets: {},
      };
      await this.store.failCheckpoint(recoveryCheckpoint);
      run.status = "completed";
      run.completedAt = iso(this.clock());
      aggregate(run, await this.store.listCheckpoints(migrationRunId));
      await this.store.updateRun(run);
      return { ...(await this.result(run)), recoveredCount };
    } catch (error) {
      const detail = { sourceTable: "migration_checkpoints", fieldName: "migrationRunId", digest: sha256(input.targetMigrationRunId), ruleCode: "DOWNSTREAM_REFERENCE_CHECK" };
      const anomaly = anomalyRecord({ migrationRunId, sourceChecksum: input.sourceChecksum, entityType: "migration_run", code: "MIG-DOWNSTREAM-REFERENCE-PRESENT", detail });
      await this.store.writeAnomalies(migrationRunId, [anomaly]);
      run.status = "failed";
      run.failedAt = iso(this.clock());
      run.failureCode = anomaly.code;
      run.processedCount = 1;
      run.failedCount = 1;
      await this.store.updateRun(run);
      return this.result(run);
    }
  }

  private async result(run: MigrationRunRecord): Promise<RunResult> {
    return {
      run: { ...run },
      checkpoints: await this.store.listCheckpoints(run.migrationRunId),
      anomalies: await this.store.listAnomalies(run.migrationRunId),
    };
  }
}

function rowIdentity(entityType: BackfillEntity, row: unknown): string[] {
  const value = row as Record<string, unknown>;
  switch (entityType) {
    case "business_identities": return [`${value.accountId}|${value.identityTypeCode}`];
    case "identity_profiles": return [`${value.accountId}|${value.identityTypeCode}`];
    case "certifications": return [`${value.legacySourceType}|${value.legacySourceId}`];
    case "certification_documents": return [String(value.legacyId)];
    case "certification_review_actions": return [String(value.requestId)];
    case "project_memberships": return [
      `${value.projectId}|${value.accountId}`,
      ...((value.roles as string[]) ?? []).map((role) => `${value.projectId}|${value.accountId}|${role}`),
    ];
    case "platform_staff_positions": return [String(value.activeDedupeKey)];
    case "workspace_preferences": return [String(value.accountId)];
  }
}

const targetTables: Record<BackfillEntity, string[]> = {
  business_identities: ["business_identities"],
  identity_profiles: ["identity_profiles"],
  certifications: ["certifications"],
  certification_documents: ["certification_documents"],
  certification_review_actions: ["certification_review_actions"],
  project_memberships: ["project_memberships", "project_membership_roles"],
  platform_staff_positions: ["platform_staff_positions"],
  workspace_preferences: ["workspace_preferences"],
};

export class MemoryMigrationStore implements MigrationStore {
  readonly runs = new Map<string, MigrationRunRecord>();
  readonly checkpoints = new Map<string, MigrationCheckpointRecord>();
  readonly anomalies = new Map<string, PlannedAnomaly>();
  readonly entities = new Map<string, Map<string, number>>();
  private nextTargetId = 1;

  async nextRunSequence(migrationVersion: string, sourceBaseline: string): Promise<number> {
    return Math.max(0, ...[...this.runs.values()].filter((run) => run.migrationVersion === migrationVersion && run.sourceBaseline === sourceBaseline).map((run) => run.runSequence)) + 1;
  }

  async createRun(run: MigrationRunRecord) {
    if (this.runs.has(run.migrationRunId)) throw new Error("duplicate migrationRunId");
    this.runs.set(run.migrationRunId, { ...run });
  }

  async getRun(migrationRunId: string) {
    const run = this.runs.get(migrationRunId);
    return run ? { ...run } : null;
  }

  async updateRun(run: MigrationRunRecord) {
    this.runs.set(run.migrationRunId, { ...run });
  }

  async getCheckpoint(migrationRunId: string, key: string) {
    const checkpoint = this.checkpoints.get(`${migrationRunId}|${key}`);
    return checkpoint ? structuredClone(checkpoint) : null;
  }

  async listCheckpoints(migrationRunId: string) {
    return [...this.checkpoints.values()].filter((item) => item.migrationRunId === migrationRunId).map((item) => structuredClone(item));
  }

  async commitBatch(input: CommitBatchInput): Promise<BatchMutationResult> {
    let succeededCount = 0;
    let skippedCount = 0;
    const targets: RecoveryTargetMap = {};
    const tables = targetTables[input.entityType];
    for (const row of input.rows) {
      const keys = rowIdentity(input.entityType, row);
      let rowInserted = false;
      keys.forEach((key, index) => {
        const tableName = tables[Math.min(index, tables.length - 1)];
        const table = this.entities.get(tableName) ?? new Map<string, number>();
        this.entities.set(tableName, table);
        if (!table.has(key)) {
          const id = this.nextTargetId++;
          table.set(key, id);
          (targets[tableName] ??= []).push(id);
          rowInserted = true;
        }
      });
      if (rowInserted) succeededCount += 1;
      else skippedCount += 1;
    }
    const checkpoint: MigrationCheckpointRecord = {
      ...input.checkpoint,
      status: "completed",
      succeededCount,
      failedCount: 0,
      skippedCount,
      targets,
    };
    this.checkpoints.set(`${input.run.migrationRunId}|${checkpoint.checkpointKey}`, checkpoint);
    return { succeededCount, skippedCount, targets };
  }

  async failCheckpoint(checkpoint: MigrationCheckpointRecord) {
    this.checkpoints.set(`${checkpoint.migrationRunId}|${checkpoint.checkpointKey}`, structuredClone(checkpoint));
  }

  async writeAnomalies(migrationRunId: string, anomalies: readonly PlannedAnomaly[]) {
    for (const anomaly of anomalies) this.anomalies.set(`${migrationRunId}|${anomaly.fingerprint}`, structuredClone(anomaly));
  }

  async listAnomalies(migrationRunId: string) {
    return [...this.anomalies.entries()].filter(([key]) => key.startsWith(`${migrationRunId}|`)).map(([, anomaly]) => structuredClone(anomaly));
  }

  async recoverTargets(targets: RecoveryTargetMap) {
    let recoveredCount = 0;
    for (const [tableName, ids] of Object.entries(targets)) {
      const table = this.entities.get(tableName);
      if (!table) continue;
      for (const [key, id] of [...table.entries()]) {
        if (ids.includes(id)) {
          table.delete(key);
          recoveredCount += 1;
        }
      }
    }
    return { recoveredCount };
  }
}

export const RUNNER_ANOMALY_CATALOG = ANOMALY_CATALOG satisfies Record<AnomalyCode, readonly [string, string]>;

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function runFromRow(row: RowDataPacket): MigrationRunRecord {
  return {
    migrationRunId: String(row.migrationRunId),
    migrationVersion: String(row.migrationVersion),
    sourceBaseline: String(row.sourceBaseline),
    sourceChecksum: String(row.sourceChecksum),
    manifestChecksum: String(row.manifestChecksum),
    configurationChecksum: String(row.configurationChecksum),
    runMode: row.runMode as RunMode,
    parentMigrationRunId: row.parentMigrationRunId ? String(row.parentMigrationRunId) : null,
    runSequence: Number(row.runSequence),
    status: row.status as RunStatus,
    startedAt: asIso(row.startedAt) ?? "",
    completedAt: asIso(row.completedAt),
    failedAt: asIso(row.failedAt),
    failureCode: row.failureCode ? String(row.failureCode) : null,
    processedCount: Number(row.processedCount),
    succeededCount: Number(row.succeededCount),
    failedCount: Number(row.failedCount),
    skippedCount: Number(row.skippedCount),
  };
}

function checkpointFromRow(row: RowDataPacket): MigrationCheckpointRecord {
  const cursor = (jsonValue(row.cursorJson) ?? {}) as { targets?: RecoveryTargetMap };
  return {
    migrationRunId: String(row.migrationRunId),
    checkpointKey: String(row.checkpointKey),
    phase: row.phase as MigrationCheckpointRecord["phase"],
    entityType: String(row.entityType),
    rangeStartExclusive: row.rangeStartExclusive === null ? null : String(row.rangeStartExclusive),
    rangeEndInclusive: row.rangeEndInclusive === null ? null : String(row.rangeEndInclusive),
    status: row.status as CheckpointStatus,
    processedCount: Number(row.processedCount),
    succeededCount: Number(row.succeededCount),
    failedCount: Number(row.failedCount),
    skippedCount: Number(row.skippedCount),
    checksum: String(row.checksum),
    targets: cursor.targets ?? {},
  };
}

export class MysqlMigrationStore implements MigrationStore {
  private sequenceLockHeld = false;

  constructor(private readonly connection: PoolConnection) {}

  async nextRunSequence(migrationVersion: string, sourceBaseline: string): Promise<number> {
    const [lockRows] = await this.connection.query<RowDataPacket[]>("SELECT GET_LOCK('v33a2-run-sequence', 5) AS acquired");
    if (Number(lockRows[0]?.acquired) !== 1) throw new Error("MIG-LOCK-RETRY-EXHAUSTED");
    this.sequenceLockHeld = true;
    const [rows] = await this.connection.execute<RowDataPacket[]>(
      "SELECT COALESCE(MAX(`runSequence`), 0) + 1 AS nextSequence FROM `migration_runs` WHERE `migrationVersion` = ? AND `sourceBaseline` = ?",
      [migrationVersion, sourceBaseline],
    );
    return Number(rows[0]?.nextSequence ?? 1);
  }

  async createRun(run: MigrationRunRecord): Promise<void> {
    try {
      await this.connection.execute(
        `INSERT INTO migration_runs
          (migrationRunId,migrationVersion,runMode,parentMigrationRunId,runSequence,sourceBaseline,sourceChecksum,manifestChecksum,configurationChecksum,status,startedAt,heartbeatAt,processedCount,succeededCount,failedCount,skippedCount)
         VALUES (?,?,?,?,?,?,?,?,?,'running',?,?,0,0,0,0)`,
        [run.migrationRunId, run.migrationVersion, run.runMode, run.parentMigrationRunId, run.runSequence, run.sourceBaseline, run.sourceChecksum, run.manifestChecksum, run.configurationChecksum, run.startedAt, run.startedAt],
      );
    } finally {
      if (this.sequenceLockHeld) {
        await this.connection.query("SELECT RELEASE_LOCK('v33a2-run-sequence')");
        this.sequenceLockHeld = false;
      }
    }
  }

  async getRun(migrationRunId: string) {
    const [rows] = await this.connection.execute<RowDataPacket[]>("SELECT * FROM migration_runs WHERE migrationRunId = ?", [migrationRunId]);
    return rows[0] ? runFromRow(rows[0]) : null;
  }

  async updateRun(run: MigrationRunRecord) {
    await this.connection.execute(
      `UPDATE migration_runs SET status=?,completedAt=?,failedAt=?,failureCode=?,heartbeatAt=?,processedCount=?,succeededCount=?,failedCount=?,skippedCount=?,version=version+1 WHERE migrationRunId=?`,
      [run.status, run.completedAt, run.failedAt, run.failureCode, new Date(), run.processedCount, run.succeededCount, run.failedCount, run.skippedCount, run.migrationRunId],
    );
  }

  async getCheckpoint(migrationRunId: string, key: string) {
    const [rows] = await this.connection.execute<RowDataPacket[]>("SELECT * FROM migration_checkpoints WHERE migrationRunId=? AND checkpointKey=?", [migrationRunId, key]);
    return rows[0] ? checkpointFromRow(rows[0]) : null;
  }

  async listCheckpoints(migrationRunId: string) {
    const [rows] = await this.connection.execute<RowDataPacket[]>("SELECT * FROM migration_checkpoints WHERE migrationRunId=? ORDER BY id", [migrationRunId]);
    return rows.map(checkpointFromRow);
  }

  async commitBatch(input: CommitBatchInput): Promise<BatchMutationResult> {
    await this.connection.beginTransaction();
    try {
      await this.connection.query("SET SESSION innodb_lock_wait_timeout=5");
      let succeededCount = 0;
      let skippedCount = 0;
      const targets: RecoveryTargetMap = {};
      for (const row of input.rows) {
        const mutation = await this.persistRow(input.entityType, row as Record<string, unknown>, input.run.migrationRunId);
        if (mutation.inserted) succeededCount += 1;
        else skippedCount += 1;
        for (const [table, ids] of Object.entries(mutation.targets)) (targets[table] ??= []).push(...ids);
      }
      await this.connection.execute(
        `INSERT INTO migration_checkpoints
          (migrationRunId,checkpointKey,phase,entityType,rangeStartExclusive,rangeEndInclusive,cursorJson,status,processedCount,succeededCount,failedCount,skippedCount,batchSize,attemptCount,checksum,startedAt,completedAt)
         VALUES (?,?,?,?,?,?,?,'completed',?,?,0,?,500,1,?,NOW(3),NOW(3))`,
        [input.run.migrationRunId, input.checkpoint.checkpointKey, input.checkpoint.phase, input.entityType, input.checkpoint.rangeStartExclusive, input.checkpoint.rangeEndInclusive, JSON.stringify({ targets }), input.checkpoint.processedCount, succeededCount, skippedCount, input.checkpoint.checksum],
      );
      await this.connection.commit();
      return { succeededCount, skippedCount, targets };
    } catch (error) {
      await this.connection.rollback();
      throw error;
    }
  }

  async failCheckpoint(checkpoint: MigrationCheckpointRecord) {
    await this.connection.execute(
      `INSERT INTO migration_checkpoints
        (migrationRunId,checkpointKey,phase,entityType,rangeStartExclusive,rangeEndInclusive,cursorJson,status,processedCount,succeededCount,failedCount,skippedCount,batchSize,attemptCount,checksum,startedAt,completedAt,failedAt,lastErrorCode)
       VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,500,1,?,NOW(3),IF(?='completed',NOW(3),NULL),IF(?='failed',NOW(3),NULL),?)
       ON DUPLICATE KEY UPDATE status=VALUES(status),processedCount=VALUES(processedCount),succeededCount=VALUES(succeededCount),failedCount=VALUES(failedCount),skippedCount=VALUES(skippedCount),cursorJson=VALUES(cursorJson),failedAt=VALUES(failedAt),completedAt=VALUES(completedAt),lastErrorCode=VALUES(lastErrorCode),version=version+1`,
      [checkpoint.migrationRunId, checkpoint.checkpointKey, checkpoint.phase, checkpoint.entityType, checkpoint.rangeStartExclusive, checkpoint.rangeEndInclusive, JSON.stringify({ targets: checkpoint.targets }), checkpoint.status, checkpoint.processedCount, checkpoint.succeededCount, checkpoint.failedCount, checkpoint.skippedCount, checkpoint.checksum, checkpoint.status, checkpoint.status, checkpoint.status === "failed" ? "MIG-BLOCKING-ANOMALY" : null],
    );
  }

  async writeAnomalies(migrationRunId: string, anomalies: readonly PlannedAnomaly[]) {
    for (const anomaly of anomalies) {
      await this.connection.execute(
        `INSERT IGNORE INTO migration_anomalies
          (migrationVersion,migrationRunId,checkpointKey,severity,entityType,entityId,code,fingerprint,handling,status,detail,detailChecksum)
         VALUES (?,?,?,?,?,?,?,?,?,'open',?,?)`,
        [MIGRATION_VERSION, migrationRunId, null, anomaly.severity, anomaly.entityType, anomaly.entityId ?? null, anomaly.code, anomaly.fingerprint, anomaly.handling, JSON.stringify(anomaly.detail), anomaly.detailChecksum],
      );
    }
  }

  async listAnomalies(migrationRunId: string): Promise<PlannedAnomaly[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>("SELECT entityType,entityId,code,severity,handling,detail,fingerprint,detailChecksum FROM migration_anomalies WHERE migrationRunId=? ORDER BY id", [migrationRunId]);
    return rows.map((row) => ({
      entityType: String(row.entityType),
      entityId: row.entityId === null ? undefined : Number(row.entityId),
      code: row.code as AnomalyCode,
      severity: row.severity as PlannedAnomaly["severity"],
      handling: row.handling as PlannedAnomaly["handling"],
      detail: (jsonValue(row.detail) ?? {}) as Record<string, unknown>,
      fingerprint: String(row.fingerprint),
      detailChecksum: String(row.detailChecksum),
    }));
  }

  async recoverTargets(targets: RecoveryTargetMap) {
    const deletionOrder = ["certification_review_actions", "certification_documents", "workspace_preferences", "project_membership_roles", "project_memberships", "identity_profiles", "certifications", "platform_staff_positions", "business_identities"];
    let recoveredCount = 0;
    await this.connection.beginTransaction();
    try {
      for (const tableName of deletionOrder) {
        const ids = [...new Set(targets[tableName] ?? [])];
        if (ids.length === 0) continue;
        const placeholders = ids.map(() => "?").join(",");
        const [result] = await this.connection.execute<ResultSetHeader>(`DELETE FROM \`${tableName}\` WHERE id IN (${placeholders})`, ids);
        recoveredCount += result.affectedRows;
      }
      await this.connection.commit();
      return { recoveredCount };
    } catch (error) {
      await this.connection.rollback();
      throw error;
    }
  }

  private async lookupId(sqlText: string, values: unknown[]): Promise<number> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sqlText, values);
    if (!rows[0]) throw new Error("MIG-MISSING-USER");
    return Number(rows[0].id);
  }

  private async persistRow(entityType: BackfillEntity, row: Record<string, unknown>, migrationRunId: string): Promise<{ inserted: boolean; targets: RecoveryTargetMap }> {
    const targets: RecoveryTargetMap = {};
    const capture = (table: string, result: ResultSetHeader) => {
      if (result.affectedRows > 0 && result.insertId > 0) (targets[table] ??= []).push(result.insertId);
    };
    if (entityType === "business_identities") {
      const typeId = await this.lookupId("SELECT id FROM identity_types WHERE code=? AND deletedAt IS NULL", [row.identityTypeCode]);
      const [result] = await this.connection.execute<ResultSetHeader>("INSERT IGNORE INTO business_identities (accountId,identityTypeId,status,source,createdBy,migrationRunId) VALUES (?,?,'active','legacy_backfill',?,?)", [row.accountId, typeId, row.accountId, migrationRunId]);
      capture("business_identities", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    if (entityType === "identity_profiles") {
      const identityId = await this.lookupId("SELECT bi.id FROM business_identities bi JOIN identity_types it ON it.id=bi.identityTypeId WHERE bi.accountId=? AND it.code=?", [row.accountId, row.identityTypeCode]);
      const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO identity_profiles (identityId,displayName,professionalTitle,introduction,skills,cityName,profileData,migrationRunId) VALUES (?,?,?,?,?,?,?,?)`, [identityId, row.displayName ?? null, row.professionalTitle ?? null, row.introduction ?? null, row.skills === undefined ? null : JSON.stringify(row.skills), row.cityName ?? null, JSON.stringify(row.profileData ?? {}), migrationRunId]);
      capture("identity_profiles", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    if (entityType === "certifications") {
      const identityId = await this.lookupId("SELECT bi.id FROM business_identities bi JOIN identity_types it ON it.id=bi.identityTypeId WHERE bi.accountId=? AND it.code=?", [row.accountId, row.identityTypeCode]);
      const typeId = await this.lookupId("SELECT id FROM certification_types WHERE code=? AND deletedAt IS NULL", [row.certificationTypeCode]);
      const dedupe = certificationActiveDedupeKey(String(row.status), { kind: "identity", id: identityId }, typeId);
      const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO certifications (applicationNo,certificationTypeId,subjectIdentityId,status,applicationData,activeDedupeKey,submittedAt,approvedAt,legacySourceType,legacySourceId,migrationRunId) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [row.applicationNo, typeId, identityId, row.status, JSON.stringify(row.applicationData ?? {}), dedupe, row.submittedAt, row.approvedAt ?? null, row.legacySourceType, row.legacySourceId, migrationRunId]);
      capture("certifications", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    if (entityType === "certification_documents") {
      const certificationId = await this.lookupId("SELECT id FROM certifications WHERE legacySourceType=? AND legacySourceId=?", [row.legacySourceType, row.legacySourceId]);
      const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO certification_documents (certificationId,fileId,documentType,versionNo,status,uploadedBy,migrationRunId) VALUES (?,?,?,1,?,?,?)`, [certificationId, row.fileId, row.documentType, row.status, row.uploadedBy, migrationRunId]);
      capture("certification_documents", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    if (entityType === "certification_review_actions") {
      const certificationId = await this.lookupId("SELECT id FROM certifications WHERE legacySourceType=? AND legacySourceId=?", [row.legacySourceType, row.legacySourceId]);
      const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO certification_review_actions (certificationId,stage,action,fromStatus,toStatus,actorId,reason,requestId,createdAt,migrationRunId) VALUES (?,?,?,?,?,?,?,?,?,?)`, [certificationId, row.stage, row.action, row.fromStatus, row.toStatus, row.actorId, row.reason, row.requestId, row.createdAt, migrationRunId]);
      capture("certification_review_actions", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    if (entityType === "project_memberships") {
      const membershipRequestId = `mig|project_membership|${row.projectId}|${row.accountId}`;
      const [memberResult] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO project_memberships (projectId,accountId,status,joinedAt,confidentialityClearance,lastRequestId,migrationRunId) VALUES (?,?,'active',NOW(),'INTERNAL',?,?)`, [row.projectId, row.accountId, membershipRequestId, migrationRunId]);
      capture("project_memberships", memberResult);
      const membershipId = await this.lookupId("SELECT id FROM project_memberships WHERE projectId=? AND accountId=?", [row.projectId, row.accountId]);
      let anyInserted = memberResult.affectedRows > 0;
      for (const role of (row.roles as string[]) ?? []) {
        const requestId = `mig|project_role|${row.projectId}|${row.accountId}|${role}`;
        const [roleResult] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO project_membership_roles (projectId,projectMembershipId,roleCode,status,assignedBy,reason,lastRequestId,migrationRunId) VALUES (?,?,?,'active',?,'legacy_backfill',?,?)`, [row.projectId, membershipId, role, row.accountId, requestId, migrationRunId]);
        capture("project_membership_roles", roleResult);
        anyInserted ||= roleResult.affectedRows > 0;
      }
      return { inserted: anyInserted, targets };
    }
    if (entityType === "platform_staff_positions") {
      const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO platform_staff_positions (accountId,positionCode,status,activeDedupeKey,assignedCaseScope,validFrom,assignedBy,assignmentReason,migrationRunId) VALUES (?,?,'active',?,'{}',?,?,'legacy_minimum_privilege',?)`, [row.accountId, row.positionCode, row.activeDedupeKey, row.validFrom, row.accountId, migrationRunId]);
      capture("platform_staff_positions", result);
      return { inserted: result.affectedRows > 0, targets };
    }
    const identityId = row.identityTypeCode ? await this.lookupId("SELECT bi.id FROM business_identities bi JOIN identity_types it ON it.id=bi.identityTypeId WHERE bi.accountId=? AND it.code=?", [row.accountId, row.identityTypeCode]) : null;
    const [result] = await this.connection.execute<ResultSetHeader>(`INSERT IGNORE INTO workspace_preferences (accountId,workspaceType,identityId,lastUsedAt,migrationRunId) VALUES (?,?,?,?,?)`, [row.accountId, row.workspaceType, identityId, row.lastUsedAt, migrationRunId]);
    capture("workspace_preferences", result);
    return { inserted: result.affectedRows > 0, targets };
  }
}

export async function loadLegacyFixture(connection: PoolConnection): Promise<LegacyFixture> {
  const [userRows] = await connection.query<RowDataPacket[]>(`
    SELECT u.id,u.role,u.createdAt,
      up.currentRole,up.engineerStatus,up.merchantStatus,up.cityCode,up.cityName
    FROM users u LEFT JOIN user_profiles up ON up.userId=u.id ORDER BY u.id
  `);
  const [engineerRows] = await connection.query<RowDataPacket[]>(`
    SELECT userId,realName,professionalTitle,introduction,skills,cityName,primaryCategory,
      yearsOfExperience,startingPrice,supportsRemote,supportsOnsite
    FROM engineer_profiles ORDER BY userId
  `);
  const [merchantRows] = await connection.query<RowDataPacket[]>(`
    SELECT userId,name,categories,description,cityName,supportsHomeService
    FROM merchant_profiles ORDER BY userId
  `);
  const engineers = new Map(engineerRows.map((row) => [Number(row.userId), row]));
  const merchants = new Map(merchantRows.map((row) => [Number(row.userId), row]));
  const users: LegacyFixture["users"] = userRows.map((row) => {
    const engineer = engineers.get(Number(row.id));
    const merchant = merchants.get(Number(row.id));
    return {
      id: Number(row.id),
      role: String(row.role),
      createdAt: asIso(row.createdAt) ?? new Date(0).toISOString(),
      profile: row.currentRole ? {
        currentRole: row.currentRole as "user" | "engineer" | "merchant",
        engineerStatus: row.engineerStatus as "none" | "pending" | "active" | "rejected",
        merchantStatus: row.merchantStatus as "none" | "pending" | "active" | "rejected",
        cityCode: row.cityCode ? String(row.cityCode) : null,
        cityName: row.cityName ? String(row.cityName) : null,
      } : null,
      engineerProfile: engineer ? {
        displayName: engineer.realName ? String(engineer.realName) : null,
        professionalTitle: engineer.professionalTitle ? String(engineer.professionalTitle) : null,
        introduction: engineer.introduction ? String(engineer.introduction) : null,
        skills: jsonValue(engineer.skills),
        cityName: engineer.cityName ? String(engineer.cityName) : null,
        primaryCategory: engineer.primaryCategory ? String(engineer.primaryCategory) : null,
        yearsOfExperience: Number(engineer.yearsOfExperience ?? 0),
        startingPrice: Number(engineer.startingPrice ?? 0),
        supportsRemote: Boolean(engineer.supportsRemote),
        supportsOnsite: Boolean(engineer.supportsOnsite),
      } : null,
      merchantProfile: merchant ? {
        displayName: String(merchant.name),
        categories: jsonValue(merchant.categories),
        description: merchant.description ? String(merchant.description) : null,
        cityName: merchant.cityName ? String(merchant.cityName) : null,
        supportsHomeService: Boolean(merchant.supportsHomeService),
      } : null,
    };
  });

  const verificationQueries = [
    ["identity", `SELECT id,userId,status,submittedAt,reviewedAt,reviewedBy,rejectReason,idNumberDigest,idNumberLast4,NULL registrationNoDigest,NULL registrationNoLast4 FROM identity_verifications ORDER BY id`],
    ["engineer", `SELECT id,userId,status,submittedAt,reviewedAt,reviewedBy,rejectReason,NULL idNumberDigest,NULL idNumberLast4,NULL registrationNoDigest,NULL registrationNoLast4 FROM engineer_verifications ORDER BY id`],
    ["merchant", `SELECT id,userId,status,submittedAt,reviewedAt,reviewedBy,rejectReason,NULL idNumberDigest,NULL idNumberLast4,registrationNoDigest,registrationNoLast4 FROM merchant_verifications ORDER BY id`],
  ] as const;
  const verifications: LegacyFixture["verifications"] = [];
  for (const [kind, statement] of verificationQueries) {
    const [rows] = await connection.query<RowDataPacket[]>(statement);
    for (const row of rows) verifications.push({
      id: Number(row.id),
      kind,
      accountId: Number(row.userId),
      status: row.status as LegacyFixture["verifications"][number]["status"],
      submittedAt: asIso(row.submittedAt) ?? new Date(0).toISOString(),
      reviewedAt: asIso(row.reviewedAt),
      reviewedBy: row.reviewedBy === null ? null : Number(row.reviewedBy),
      rejectReason: row.rejectReason ? String(row.rejectReason) : null,
      idNumberDigest: row.idNumberDigest ? String(row.idNumberDigest) : null,
      idNumberLast4: row.idNumberLast4 ? String(row.idNumberLast4) : null,
      registrationNoDigest: row.registrationNoDigest ? String(row.registrationNoDigest) : null,
      registrationNoLast4: row.registrationNoLast4 ? String(row.registrationNoLast4) : null,
    });
  }

  const [documentRows] = await connection.query<RowDataPacket[]>(`
    SELECT vd.id,vd.verificationType,vd.verificationId,vd.ownerId,vd.documentType,vd.status,sf.id storedFileId
    FROM verification_documents vd
    LEFT JOIN stored_files sf ON sf.storageKey=vd.storageKey AND sf.ownerId=vd.ownerId
    ORDER BY vd.id
  `);
  const [actionRows] = await connection.query<RowDataPacket[]>(`
    SELECT id,verificationType,verificationId,actorId,action,fromStatus,toStatus,reason,createdAt
    FROM verification_actions ORDER BY id
  `);
  const [projectRows] = await connection.query<RowDataPacket[]>("SELECT id,ownerId,engineerId,createdAt FROM projects ORDER BY id");
  const [acceptanceRows] = await connection.query<RowDataPacket[]>("SELECT id,projectId,milestoneId,submittedBy FROM project_acceptances ORDER BY id");

  return {
    users,
    verifications,
    projects: projectRows.map((row) => ({ id: Number(row.id), ownerId: Number(row.ownerId), engineerId: Number(row.engineerId), createdAt: asIso(row.createdAt) ?? new Date(0).toISOString() })),
    acceptances: acceptanceRows.map((row) => ({ id: Number(row.id), projectId: Number(row.projectId), milestoneId: Number(row.milestoneId), submittedBy: Number(row.submittedBy) })),
    verificationDocuments: documentRows.map((row) => ({
      id: Number(row.id),
      verificationType: row.verificationType as "identity" | "engineer" | "merchant",
      verificationId: Number(row.verificationId),
      ownerId: Number(row.ownerId),
      documentType: String(row.documentType),
      storedFileId: row.storedFileId === null ? null : Number(row.storedFileId),
      status: row.status as "available" | "superseded" | "disabled",
    })),
    verificationActions: actionRows.map((row) => ({
      id: Number(row.id),
      verificationType: row.verificationType as "identity" | "engineer" | "merchant",
      verificationId: Number(row.verificationId),
      actorId: Number(row.actorId),
      action: row.action as "submit" | "resubmit" | "start_review" | "approve" | "request_info" | "reject" | "revoke",
      fromStatus: row.fromStatus ? String(row.fromStatus) : null,
      toStatus: String(row.toStatus),
      reason: row.reason ? String(row.reason) : null,
      createdAt: asIso(row.createdAt) ?? new Date(0).toISOString(),
    })),
  };
}
