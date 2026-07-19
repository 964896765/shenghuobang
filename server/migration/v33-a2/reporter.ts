import { canonicalJson, sha256 } from "./contract";
import type { RunResult } from "./runner";

export interface MigrationExecutionReport {
  reportVersion: "v3.3-a2.3-report-1";
  generatedAt: string;
  databaseExecution: "EXECUTED" | "BLOCKED_BY_ENVIRONMENT";
  migrationRunId: string | null;
  runMode: string | null;
  status: string;
  sourceBaseline: string;
  sourceChecksum: string | null;
  counts: {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    checkpoints: number;
    anomalies: number;
    blockingAnomalies: number;
    warningAnomalies: number;
    recovered: number;
  };
  checkpointSummary: Array<{
    checkpointKey: string;
    entityType: string;
    status: string;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    checksum: string;
  }>;
  anomalySummary: Array<{
    code: string;
    severity: string;
    handling: string;
    count: number;
  }>;
  environmentBlocker: string | null;
  reportChecksum: string;
}

function withChecksum(report: Omit<MigrationExecutionReport, "reportChecksum">): MigrationExecutionReport {
  return { ...report, reportChecksum: sha256(canonicalJson(report)) };
}

export function buildMigrationReport(
  result: RunResult,
  input: { generatedAt: Date; databaseExecution?: "EXECUTED" | "BLOCKED_BY_ENVIRONMENT" },
): MigrationExecutionReport {
  const grouped = new Map<string, { code: string; severity: string; handling: string; count: number }>();
  for (const anomaly of result.anomalies) {
    const key = `${anomaly.code}|${anomaly.severity}|${anomaly.handling}`;
    const current = grouped.get(key) ?? { code: anomaly.code, severity: anomaly.severity, handling: anomaly.handling, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }
  return withChecksum({
    reportVersion: "v3.3-a2.3-report-1",
    generatedAt: input.generatedAt.toISOString(),
    databaseExecution: input.databaseExecution ?? "EXECUTED",
    migrationRunId: result.run.migrationRunId,
    runMode: result.run.runMode,
    status: result.run.status,
    sourceBaseline: result.run.sourceBaseline,
    sourceChecksum: result.run.sourceChecksum,
    counts: {
      processed: result.run.processedCount,
      succeeded: result.run.succeededCount,
      failed: result.run.failedCount,
      skipped: result.run.skippedCount,
      checkpoints: result.checkpoints.length,
      anomalies: result.anomalies.length,
      blockingAnomalies: result.anomalies.filter((item) => item.severity === "BLOCKING").length,
      warningAnomalies: result.anomalies.filter((item) => item.severity === "WARNING").length,
      recovered: result.recoveredCount ?? 0,
    },
    checkpointSummary: result.checkpoints.map((item) => ({
      checkpointKey: item.checkpointKey,
      entityType: item.entityType,
      status: item.status,
      processed: item.processedCount,
      succeeded: item.succeededCount,
      failed: item.failedCount,
      skipped: item.skippedCount,
      checksum: item.checksum,
    })),
    anomalySummary: [...grouped.values()].sort((left, right) => left.code.localeCompare(right.code)),
    environmentBlocker: null,
  });
}

export function buildEnvironmentBlockedReport(input: {
  generatedAt: Date;
  reason: string;
}): MigrationExecutionReport {
  return withChecksum({
    reportVersion: "v3.3-a2.3-report-1",
    generatedAt: input.generatedAt.toISOString(),
    databaseExecution: "BLOCKED_BY_ENVIRONMENT",
    migrationRunId: null,
    runMode: null,
    status: "BLOCKED_BY_ENVIRONMENT",
    sourceBaseline: "v3.2.4+migrations-0000-0014",
    sourceChecksum: null,
    counts: { processed: 0, succeeded: 0, failed: 0, skipped: 0, checkpoints: 0, anomalies: 0, blockingAnomalies: 0, warningAnomalies: 0, recovered: 0 },
    checkpointSummary: [],
    anomalySummary: [],
    environmentBlocker: input.reason,
  });
}

export function reportJson(report: MigrationExecutionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function reportMarkdown(report: MigrationExecutionReport): string {
  const rows = [
    ["processed", report.counts.processed],
    ["succeeded", report.counts.succeeded],
    ["failed", report.counts.failed],
    ["skipped", report.counts.skipped],
    ["checkpoints", report.counts.checkpoints],
    ["anomalies", report.counts.anomalies],
    ["blockingAnomalies", report.counts.blockingAnomalies],
    ["warningAnomalies", report.counts.warningAnomalies],
    ["recovered", report.counts.recovered],
  ];
  const anomalyRows = report.anomalySummary.length === 0
    ? "| - | - | - | 0 |"
    : report.anomalySummary.map((item) => `| ${item.code} | ${item.severity} | ${item.handling} | ${item.count} |`).join("\n");
  return `# V3.3-A / A2.3 Migration Execution Report

- generatedAt: \`${report.generatedAt}\`
- databaseExecution: \`${report.databaseExecution}\`
- migrationRunId: \`${report.migrationRunId ?? "N/A"}\`
- runMode: \`${report.runMode ?? "N/A"}\`
- status: \`${report.status}\`
- sourceBaseline: \`${report.sourceBaseline}\`
- sourceChecksum: \`${report.sourceChecksum ?? "N/A"}\`
- reportChecksum: \`${report.reportChecksum}\`
- environmentBlocker: ${report.environmentBlocker ?? "none"}

## Counts

| Metric | Count |
|---|---:|
${rows.map(([name, count]) => `| ${name} | ${count} |`).join("\n")}

## Anomalies

| Code | Severity | Handling | Count |
|---|---|---|---:|
${anomalyRows}

## Reviewer backfill invariant

\`project_acceptances.submittedBy\` is never used to populate \`reviewerProjectMembershipId\`. Unknown historical reviewers remain \`NULL\` and are reported as \`MIG-REVIEWER-UNKNOWN\`.
`;
}
