import assert from "node:assert/strict";
import { assertSafeAnomalyDetail } from "../server/migration/v33-a2/contract";
import { planLegacyBackfill, type LegacyFixture } from "../server/migration/v33-a2/planner";
import { buildMigrationReport, reportJson, reportMarkdown } from "../server/migration/v33-a2/reporter";
import { certificationActiveDedupeKey, MemoryMigrationStore, MigrationRunner, SimulatedDisconnectError } from "../server/migration/v33-a2/runner";

async function main() {
const sourceChecksum = "a".repeat(64);
const fixture: LegacyFixture = {
  users: [
    { id: 1, role: "user", createdAt: "2026-01-01T00:00:00.000Z", profile: { currentRole: "user", engineerStatus: "none", merchantStatus: "none" } },
    {
      id: 2,
      role: "verification_reviewer",
      createdAt: "2026-01-02T00:00:00.000Z",
      profile: { currentRole: "engineer", engineerStatus: "active", merchantStatus: "none" },
      engineerProfile: { displayName: "Fixture Engineer", professionalTitle: "Engineer", skills: ["design"], startingPrice: 100, supportsRemote: true },
    },
    {
      id: 3,
      role: "customer_service",
      createdAt: "2026-01-03T00:00:00.000Z",
      profile: { currentRole: "merchant", engineerStatus: "none", merchantStatus: "pending" },
      merchantProfile: { displayName: "Fixture Merchant", categories: ["repair"], supportsHomeService: true },
    },
    { id: 4, role: "unknown_super_role", createdAt: "2026-01-04T00:00:00.000Z", profile: { currentRole: "user", engineerStatus: "active", merchantStatus: "none" } },
  ],
  verifications: [
    { id: 11, kind: "engineer", accountId: 2, status: "approved", submittedAt: "2026-02-01T00:00:00.000Z", reviewedAt: "2026-02-02T00:00:00.000Z", reviewedBy: 3 },
    { id: 12, kind: "merchant", accountId: 3, status: "submitted", submittedAt: "2026-02-03T00:00:00.000Z", registrationNoDigest: "b".repeat(64), registrationNoLast4: "1234" },
  ],
  verificationDocuments: [
    { id: 21, verificationType: "engineer", verificationId: 11, ownerId: 2, documentType: "portfolio", storedFileId: 901, status: "available" },
  ],
  verificationActions: [
    { id: 31, verificationType: "engineer", verificationId: 11, actorId: 3, action: "approve", fromStatus: "under_review", toStatus: "approved", createdAt: "2026-02-02T00:00:00.000Z" },
  ],
  projects: [
    { id: 41, ownerId: 2, engineerId: 2, createdAt: "2026-03-01T00:00:00.000Z" },
    { id: 42, ownerId: 1, engineerId: 2, createdAt: "2026-03-02T00:00:00.000Z" },
  ],
  acceptances: [{ id: 51, projectId: 41, milestoneId: 61, submittedBy: 2 }],
};

const planned = planLegacyBackfill(fixture, { migrationRunId: "v33a2-20260101T000000000Z-000000000001", sourceChecksum });
assert.equal(planned.identities.filter((item) => item.identityTypeCode === "consumer").length, fixture.users.length, "each user needs one consumer identity");
assert(planned.identities.some((item) => item.accountId === 2 && item.identityTypeCode === "engineer"));
assert(planned.identities.some((item) => item.accountId === 3 && item.identityTypeCode === "merchant"));
assert.equal(planned.profiles.length, 2, "engineer and merchant profiles are migrated without organizations");
assert.equal(planned.certifications.length, 2);
assert.equal(certificationActiveDedupeKey("approved", { kind: "identity", id: 7 }, 3), "cert|identity:7|3");
assert.equal(certificationActiveDedupeKey("pending", { kind: "organization", id: 9 }, 2), "cert|organization:9|2");
assert.equal(certificationActiveDedupeKey("rejected", { kind: "identity", id: 7 }, 3), null);
assert.equal(planned.certificationDocuments.length, 1);
assert.equal(planned.certificationReviewActions.length, 1);
const dualRole = planned.memberships.find((item) => item.projectId === 41 && item.accountId === 2);
assert.deepEqual(dualRole?.roles, ["engineer", "initiator"], "owner=engineer produces one membership and two roles");
assert.equal(planned.memberships.filter((item) => item.projectId === 41).length, 1);
assert.equal(planned.platformPositions.some((item) => item.accountId === 4), false, "unknown legacy role cannot gain a position");
assert(planned.anomalies.some((item) => item.code === "MIG-UNMAPPED-LEGACY-ROLE" && item.handling === "MIN_PRIVILEGE"));
assert(planned.anomalies.some((item) => item.code === "MIG-STATE-CONFLICT" && item.entityId === 4 && item.handling === "MIN_PRIVILEGE"));
assert.equal(planned.reviewerUpdates.length, 0, "submittedBy must never create reviewer membership facts");
assert(planned.anomalies.some((item) => item.code === "MIG-REVIEWER-UNKNOWN" && item.entityId === 51));
assert.throws(() => assertSafeAnomalyDetail({ phone: "13800000000" }), /MIG-ANOMALY-DETAIL-UNSAFE/);
assert.throws(() => assertSafeAnomalyDetail({ storageKey: "private/file" }), /MIG-ANOMALY-DETAIL-UNSAFE/);
for (const anomaly of planned.anomalies) {
  const text = JSON.stringify(anomaly.detail).toLowerCase();
  for (const forbidden of ["phone", "email", "address", "idnumber", "token", "storagekey"]) {
    assert.equal(text.includes(`\"${forbidden}\"`), false, `anomaly detail leaked ${forbidden}`);
  }
}

let clockTick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, clockTick++));
const store = new MemoryMigrationStore();
const runner = new MigrationRunner(store, clock);
const first = await runner.migrate(fixture, { sourceChecksum });
assert.equal(first.run.status, "completed");
const consumerRowsAfterFirst = store.entities.get("business_identities")?.size;
const rerun = await runner.migrate(fixture, { sourceChecksum, runMode: "rerun", parentMigrationRunId: first.run.migrationRunId });
assert.equal(rerun.run.status, "completed");
assert.equal(store.entities.get("business_identities")?.size, consumerRowsAfterFirst, "rerun is idempotent");
assert(rerun.run.skippedCount > 0);

const blockingFixture: LegacyFixture = {
  ...fixture,
  verificationDocuments: [...(fixture.verificationDocuments ?? []), { id: 22, verificationType: "merchant", verificationId: 12, ownerId: 3, documentType: "license", storedFileId: null, status: "available" }],
};
const blockingStore = new MemoryMigrationStore();
const blockingRunner = new MigrationRunner(blockingStore, clock);
const failed = await blockingRunner.migrate(blockingFixture, { sourceChecksum });
assert.equal(failed.run.status, "failed");
assert.equal(failed.run.completedAt, null, "BLOCKING anomaly can never complete a run");
assert(failed.checkpoints.some((item) => item.status === "failed"));
const fixedRerun = await blockingRunner.migrate(fixture, { sourceChecksum, runMode: "rerun", parentMigrationRunId: failed.run.migrationRunId });
assert.equal(fixedRerun.run.status, "completed");
assert.equal(fixedRerun.run.parentMigrationRunId, failed.run.migrationRunId);

const resumeStore = new MemoryMigrationStore();
const resumeRunner = new MigrationRunner(resumeStore, clock);
let disconnected = false;
await assert.rejects(
  resumeRunner.migrate(fixture, {
    sourceChecksum,
    afterCheckpoint: () => {
      if (!disconnected) {
        disconnected = true;
        throw new SimulatedDisconnectError();
      }
    },
  }),
  SimulatedDisconnectError,
);
const interrupted = [...resumeStore.runs.values()][0];
assert.equal(interrupted.status, "running");
const resumed = await resumeRunner.migrate(fixture, { sourceChecksum, resumeMigrationRunId: interrupted.migrationRunId });
assert.equal(resumed.run.status, "completed");
assert.equal(resumed.checkpoints.filter((item) => item.status === "completed").length, 8);

await assert.rejects(() => resumeRunner.recovery({ sourceChecksum, targetMigrationRunId: "" }), /explicit/);
const recovery = await resumeRunner.recovery({ sourceChecksum, targetMigrationRunId: resumed.run.migrationRunId, checkpointKey: resumed.checkpoints[0].checkpointKey, checkpointChecksum: resumed.checkpoints[0].checksum });
assert.equal(recovery.run.status, "completed");
assert(recovery.recoveredCount !== undefined);

const mismatchStore = new MemoryMigrationStore();
const mismatchRunner = new MigrationRunner(mismatchStore, clock);
const mismatchSource = await mismatchRunner.migrate(fixture, { sourceChecksum });
const entityCountBeforeMismatch = [...mismatchStore.entities.values()].reduce((sum, table) => sum + table.size, 0);
const badBaselineRun = mismatchStore.runs.get(mismatchSource.run.migrationRunId)!;
badBaselineRun.sourceBaseline = "wrong-baseline";
await assert.rejects(
  () => mismatchRunner.recovery({ sourceChecksum, targetMigrationRunId: mismatchSource.run.migrationRunId }),
  /MIG-SOURCE-BASELINE-MISMATCH/,
);
badBaselineRun.sourceBaseline = "v3.2.4+migrations-0000-0014";
await assert.rejects(
  () => mismatchRunner.recovery({ sourceChecksum, targetMigrationRunId: mismatchSource.run.migrationRunId, checkpointKey: mismatchSource.checkpoints[0].checkpointKey, checkpointChecksum: "0".repeat(64) }),
  /MIG-CHECKPOINT-CHECKSUM-MISMATCH/,
);
assert.equal([...mismatchStore.entities.values()].reduce((sum, table) => sum + table.size, 0), entityCountBeforeMismatch, "failed recovery validation cannot delete rows");

const report = buildMigrationReport(resumed, { generatedAt: new Date("2026-04-01T00:00:00.000Z") });
const parsed = JSON.parse(reportJson(report)) as typeof report;
const markdown = reportMarkdown(report);
assert.deepEqual(parsed.counts, report.counts);
assert(markdown.includes(`| processed | ${report.counts.processed} |`));
assert(markdown.includes(`| anomalies | ${report.counts.anomalies} |`));
assert(markdown.includes("submittedBy"));
assert(markdown.includes("MIG-REVIEWER-UNKNOWN"));

const manyUsers: LegacyFixture = {
  users: Array.from({ length: 501 }, (_, index) => ({ id: index + 1000, role: "user", createdAt: "2026-01-01T00:00:00.000Z" })),
  verifications: [],
  projects: [],
  acceptances: [],
};
const batchStore = new MemoryMigrationStore();
const batchResult = await new MigrationRunner(batchStore, clock).migrate(manyUsers, { sourceChecksum });
assert.equal(batchResult.checkpoints.filter((item) => item.entityType === "business_identities").length, 2, "501 rows require two fixed-size checkpoints");
assert(batchResult.checkpoints.every((item) => item.processedCount <= 500));

console.log("V3.3-A A2.3 synthetic backfill: PASS");
console.log(`identities=${planned.identities.length} profiles=${planned.profiles.length} certifications=${planned.certifications.length}`);
console.log(`checkpoints=${resumed.checkpoints.length} anomalies=${resumed.anomalies.length} reviewerUpdates=${planned.reviewerUpdates.length}`);
console.log("databaseIntegration=BLOCKED_BY_ENVIRONMENT (synthetic memory adapter used)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
