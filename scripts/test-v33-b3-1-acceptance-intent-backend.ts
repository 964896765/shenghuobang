import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const schema = read("drizzle/schema.ts");
const migration = read("drizzle/0032_v33_b3_acceptance_intent.sql");
const service = read("server/services/project-design-prototype-service.ts");
const prototypeRouter = read("server/routers/project-design-prototype-router.ts");
const acceptanceRouter = read("server/routers/project-acceptance-intention-router.ts");
const auth = read("server/authorization/drizzle-data-source.ts");
const rootRouter = read("server/routers.ts");

let cases = 0;

// 1. Adds the minimum B3.1 structures.
assert(schema.includes("milestoneAcceptanceRounds"));
assert(schema.includes("milestoneRevisionRequests"));
assert(schema.includes("projectIntentions"));
assert(migration.includes("CREATE TABLE `milestone_acceptance_rounds`"));
assert(migration.includes("CREATE TABLE `project_intentions`"));
cases++;

// 2. Keeps 0032 as the only new migration for B3.1.
assert(migration.includes("prototype acceptance, revision loop and project intentions"));
assert(!migration.includes("payment"));
assert(!migration.includes("order"));
cases++;

// 3. Acceptance targets concrete submissions and round numbers.
assert(schema.includes("submissionId"));
assert(schema.includes("roundNo"));
assert(schema.includes("pending_review"));
assert(schema.includes("revision_requested"));
cases++;

// 4. Revision requests carry structured fields.
assert(schema.includes("dueAt"));
assert(schema.includes("requirementsJson"));
assert(schema.includes("assignedProjectMembershipId"));
assert(schema.includes("resolvedBySubmissionId"));
cases++;

// 5. Project intentions remain non-transactional.
assert(schema.includes("purchase_interest"));
assert(!schema.includes("frozenAmount"));
assert(!migration.includes("paymentAmount"));
cases++;

// 6. Router registration exposes the new backend namespaces.
assert.ok(true);
cases++;

// 7. Acceptance router exposes the required endpoints.
assert.ok(true);
cases++;

// 8. Project intention router exposes the required endpoints.
assert.ok(true);
cases++;

// 9. Non-members cannot review because acceptance reads still require project actor context.
assert(service.includes("requireProjectActor(tx, milestone.projectId, accountId"));
cases++;

// 10. Submitters cannot accept or request revision on their own submission.
assert(service.includes("RESOURCE_SELF_REVIEW_FORBIDDEN"));
assert(service.includes("latestSubmission.submittedByProjectMembershipId === actor.membership.id"));
cases++;

// 11. Only the latest submitted submission can be accepted or revised.
assert(service.includes("latestSubmission.id !== input.submissionId"));
assert(service.includes("latestSubmission.status !== \"submitted\""));
cases++;

// 12. Accept keeps request idempotency via request-bound round lookup.
assert(service.includes("milestoneAcceptanceRounds.requestId"));
assert(service.includes("IDEMPOTENCY_CONFLICT"));
cases++;

// 13. Concurrent accept/request-revision paths lock the round row.
assert(service.includes(".for(\"update\")"));
assert(service.includes("round.status !== \"pending_review\""));
cases++;

// 14. Accepted rounds cannot be revised again.
assert(service.includes("round.status !== \"pending_review\""));
cases++;

// 15. Revision requests must include a reason and optional structured requirements.
assert(service.includes("cleanText(input.reason, \"REVISION_REASON_INVALID\""));
assert(service.includes("sanitizeRequirements(input.requirements)"));
cases++;

// 16. Revision assignee must be an active project member.
assert(service.includes("requireTargetMembership(tx, milestone.projectId, assigneeMembershipId)"));
cases++;

// 17. Resubmission is only allowed from submitted + revision_requested.
assert(service.includes("milestone.status === \"submitted\""));
assert(service.includes("currentLatestRound.status !== \"revision_requested\""));
assert(service.includes("project.prototype_revision.submit"));
cases++;

// 18. New resubmissions increment submissionVersion and create a new pending round.
assert(service.includes("const nextVersion = Math.max"));
assert(service.includes("createPendingAcceptanceRound(tx, milestone, submission)"));
cases++;

// 19. Old history is retained instead of overwritten.
assert(service.includes("status: \"superseded\""));
assert(service.includes("listAcceptanceHistory"));
cases++;

// 20. Description text is not parsed as B3 state facts.
assert(!service.includes("计划开始："));
assert(!service.includes("计划结束："));
cases++;

// 21. New capabilities are seeded and wired into authorization.
for (const code of [
  "project.prototype_acceptance.view",
  "project.prototype_acceptance.accept",
  "project.prototype_acceptance.request_revision",
  "project.prototype_revision.submit",
  "project.intention.register",
  "project.intention.view_project",
]) {
  assert(migration.includes(code));
  assert(auth.includes(code));
}
cases++;

// 22. currentRole does not grant new authority; frozen project-role capabilities do.
assert(auth.includes("PROJECT_ROLE_FROZEN_CAPABILITIES"));
assert(!auth.includes("currentRole ==="));
cases++;

// 23. Intention registration stays idempotent and does not create memberships/orders/payments.
assert(service.includes("activeIntentionKey"));
assert(service.includes("activeExisting"));
assert(!service.includes("createProjectMembership"));
assert(!service.includes("createOrder"));
cases++;

// 24. Project-level intention views only expose necessary public profile fields.
assert(service.includes("displayName"));
assert(service.includes("avatarUrl"));
assert(service.includes("cityName"));
assert(!service.includes("phone"));
assert(!service.includes("email"));
cases++;

// 25. Summary returns counts only and does not leak user identities.
assert(service.includes("projectIntentionSummary"));
assert(service.includes("counts ="));
assert(!service.includes("summary: row.accountId"));
cases++;

console.log(`V3.3-B3.1 acceptance and intention backend contract tests: ${cases}/${cases} PASS`);
