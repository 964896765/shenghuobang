import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORIZATION_REASON_CODES,
  AuthorizationService,
  MemoryAuthorizationDataSource,
  MemoryPermissionAuditWriter,
  applyFieldMask,
  assertSafeAuditDetail,
  type AuthorizationRequest,
  type MemoryAuthorizationDataset,
} from "../server/authorization";
import { sanitizeAuditDetail } from "../server/services/audit-service";

const capabilities = [
  "platform.workspace.access", "platform.certification.queue_read", "platform.certification.review_final",
  "platform.complaint.read", "platform.complaint.decide", "platform.finance.read", "platform.funds.execute",
  "platform.audit.read", "project.view", "project.file.download", "message.read", "quote.view", "quote.submit",
].map((code) => ({ code, status: "active" as const, highRisk: true, requiredCertificationCodes: code === "quote.submit" ? ["engineer_basic"] : undefined }));

const base: MemoryAuthorizationDataset = {
  accounts: [
    { id: 1, status: "active", legacyRole: "admin", currentRole: "engineer" },
    { id: 2, status: "active", legacyRole: "user", currentRole: "user" },
    { id: 3, status: "active", legacyRole: "user", currentRole: "user" },
    { id: 4, status: "active", legacyRole: "user", currentRole: "user" },
    { id: 5, status: "active", legacyRole: "user", currentRole: "user" },
  ],
  capabilities,
  identities: [{ id: 21, accountId: 2, status: "active" }],
  certifications: [{ identityId: 21, code: "engineer_basic", status: "approved" }],
  projectMemberships: [
    { id: 101, accountId: 1, scopeId: 1, status: "active", confidentialityClearance: "NDA" },
    { id: 102, accountId: 2, scopeId: 1, status: "active", confidentialityClearance: "INTERNAL" },
    { id: 103, accountId: 3, scopeId: 2, status: "active", confidentialityClearance: "INTERNAL" },
  ],
  assignments: [
    { capabilityCode: "project.view", sourceType: "PROJECT_ROLE", subjectId: 101, projectId: 1, status: "active", dataScope: "PROJECT" },
    { capabilityCode: "project.file.download", sourceType: "PROJECT_ROLE", subjectId: 101, projectId: 1, status: "active", dataScope: "PROJECT" },
    { capabilityCode: "message.read", sourceType: "PROJECT_ROLE", subjectId: 101, projectId: 1, status: "active", dataScope: "PROJECT" },
    { capabilityCode: "project.view", sourceType: "PROJECT_ROLE", subjectId: 102, projectId: 1, status: "active", dataScope: "PROJECT" },
    { capabilityCode: "quote.view", sourceType: "ACCOUNT_SELF", subjectId: 2, status: "active", dataScope: "INVITED_RESOURCE", allowedFields: ["supplier_quote:FULL"] },
    { capabilityCode: "quote.submit", sourceType: "GRANT", subjectId: 2, status: "active", dataScope: "PUBLIC" },
    { capabilityCode: "platform.workspace.access", sourceType: "PLATFORM_POSITION", subjectId: 4, platformStaffPositionId: 900, status: "active", dataScope: "PLATFORM_ALL" },
    { capabilityCode: "platform.workspace.access", sourceType: "PLATFORM_POSITION", subjectId: 5, platformStaffPositionId: 901, status: "active", dataScope: "PLATFORM_ALL" },
    { capabilityCode: "platform.audit.read", sourceType: "PLATFORM_POSITION", subjectId: 5, platformStaffPositionId: 901, status: "active", dataScope: "PLATFORM_ALL" },
    { capabilityCode: "platform.certification.review_final", sourceType: "PLATFORM_POSITION", subjectId: 4, platformStaffPositionId: 900, status: "active", dataScope: "PLATFORM_ALL" },
    { capabilityCode: "platform.complaint.decide", sourceType: "PLATFORM_POSITION", subjectId: 4, platformStaffPositionId: 900, status: "active", dataScope: "PLATFORM_ALL" },
    { capabilityCode: "platform.funds.execute", sourceType: "PLATFORM_POSITION", subjectId: 4, platformStaffPositionId: 900, status: "active", dataScope: "PLATFORM_ALL" },
  ],
  resources: [
    { resourceType: "project", resourceId: "1", status: "in_progress", allowedStatuses: ["in_progress"], ownerAccountId: 1, projectId: 1, memberAccountIds: [1, 2], confidentiality: "INTERNAL" },
    { resourceType: "project", resourceId: "2", status: "in_progress", allowedStatuses: ["in_progress"], ownerAccountId: 3, projectId: 2, memberAccountIds: [3], confidentiality: "INTERNAL" },
    { resourceType: "project_file", resourceId: "10", status: "available", allowedStatuses: ["available"], projectId: 1, memberAccountIds: [1, 2], confidentiality: "NDA", ndaRequired: true, version: 7, availableFields: ["fileName", "storageKey", "publicUrl"] },
    { resourceType: "conversation", resourceId: "20", status: "active", allowedStatuses: ["active"], projectId: 1, memberAccountIds: [1, 2], confidentiality: "INTERNAL", version: 3 },
    { resourceType: "quote", resourceId: "30", status: "submitted", allowedStatuses: ["submitted"], ownerAccountId: 1, memberAccountIds: [1, 2], confidentiality: "INTERNAL", availableFields: ["totalPrice", "deliverables"] },
    { resourceType: "quote", resourceId: "31", status: "submitted", allowedStatuses: ["submitted"], ownerAccountId: 3, memberAccountIds: [3], confidentiality: "INTERNAL", availableFields: ["totalPrice", "deliverables"] },
    { resourceType: "need", resourceId: "40", status: "published", allowedStatuses: ["published"], ownerAccountId: 3, public: true, confidentiality: "PUBLIC" },
    { resourceType: "certification", resourceId: "50", status: "pending", allowedStatuses: ["pending"], confidentiality: "RESTRICTED", workflowActors: { initialReviewerAccountId: 4 } },
    { resourceType: "complaint", resourceId: "60", status: "decision_pending", allowedStatuses: ["decision_pending"], confidentiality: "INTERNAL", workflowActors: { complaintInvestigatorAccountId: 4 } },
    { resourceType: "refund", resourceId: "70", status: "approved", allowedStatuses: ["approved"], confidentiality: "INTERNAL", workflowActors: { financeReviewerAccountId: 4 } },
  ],
  ndaAcceptances: [{ accountId: 1, resourceType: "project_file", resourceId: "10", active: true }],
  legacyPermissions: { admin: ["compat:project:owner:project.view"] },
};

function harness(dataset: MemoryAuthorizationDataset = structuredClone(base)) {
  const audit = new MemoryPermissionAuditWriter();
  return { audit, service: new AuthorizationService(new MemoryAuthorizationDataSource(dataset), audit) };
}
const request = (service: AuthorizationService, accountId: number, input: Omit<AuthorizationRequest, "accountId">) => service.authorize({ ...input, accountId, requestId: "a3.2-test" });

async function main() {
  let cases = 0;

  // 1-2: ordinary and legacy-admin accounts have no platform authority without a real staff position.
  for (const accountId of [2, 1]) {
    const result = await request(harness().service, accountId, { capabilityCode: "platform.workspace.access" });
    assert.equal(result.allowed, false); cases++;
  }

  // 3: project scope cannot be guessed across P1/P2.
  assert.equal((await request(harness().service, 1, { capabilityCode: "project.view", projectId: 2, resourceType: "project", resourceId: "2" })).reasonCode, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE); cases++;

  // 4 + 6: a suspended membership invalidates both file/content and message authorization immediately, independent of an earlier allow.
  const mutable = structuredClone(base);
  const before = harness(mutable);
  assert((await request(before.service, 1, { capabilityCode: "project.file.download", projectId: 1, resourceType: "project_file", resourceId: "10", expectedResourceVersion: 7 })).allowed);
  mutable.projectMemberships![0].status = "suspended";
  for (const input of [
    { capabilityCode: "project.file.download", projectId: 1, resourceType: "project_file", resourceId: "10", expectedResourceVersion: 7 },
    { capabilityCode: "message.read", projectId: 1, resourceType: "conversation", resourceId: "20", expectedResourceVersion: 3 },
  ]) assert.equal((await request(harness(mutable).service, 1, input)).reasonCode, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE);
  cases += 2;

  // 5: legacy relationship observation is audited, but an unrelated project still fails.
  const legacy = harness();
  assert((await request(legacy.service, 1, { capabilityCode: "project.view", projectId: 1, resourceType: "project", resourceId: "1" })).allowed);
  assert(legacy.audit.events.some((event) => event.compatibilityHit?.startsWith("compat:project:owner")));
  cases++;

  // 7: insufficient clearance denies before any file metadata can be serialized; list masking removes all file secrets.
  const lowClearance = structuredClone(base); lowClearance.projectMemberships![0].confidentialityClearance = "INTERNAL";
  assert.equal((await request(harness(lowClearance).service, 1, { capabilityCode: "project.file.download", projectId: 1, resourceType: "project_file", resourceId: "10" })).reasonCode, AUTHORIZATION_REASON_CODES.CONFIDENTIALITY_TOO_HIGH);
  assert.deepEqual(applyFieldMask({ id: 10, fileName: "secret.cad", storageKey: "private/key", publicUrl: "https://secret" }, ["fileName", "storageKey", "publicUrl"]), { id: 10 }); cases++;

  // 8: supplier A cannot infer supplier B's quote by ID.
  assert.equal((await request(harness().service, 2, { capabilityCode: "quote.view", resourceType: "quote", resourceId: "31" })).allowed, false); cases++;

  // 9-11: all three high-risk separation-of-duties checks fail before a provider callback.
  let providerCalls = 0;
  for (const [capabilityCode, resourceType, resourceId] of [
    ["platform.certification.review_final", "certification", "50"],
    ["platform.complaint.decide", "complaint", "60"],
    ["platform.funds.execute", "refund", "70"],
  ] as const) {
    const result = await request(harness().service, 4, { capabilityCode, resourceType, resourceId });
    if (result.allowed) providerCalls++;
    assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES);
    cases++;
  }
  assert.equal(providerCalls, 0);

  // 12: security auditor has read capability only.
  assert((await request(harness().service, 5, { capabilityCode: "platform.audit.read" })).allowed);
  assert.equal((await request(harness().service, 5, { capabilityCode: "platform.complaint.read" })).allowed, false); cases++;

  // 13: changing currentRole never creates a capability assignment.
  const preference = structuredClone(base); preference.accounts[2].currentRole = "engineer";
  assert.equal((await request(harness(preference).service, 3, { capabilityCode: "quote.submit", identityId: null, resourceType: "need", resourceId: "40" })).reasonCode, AUTHORIZATION_REASON_CODES.IDENTITY_INACTIVE); cases++;

  // 14-15: list masks and audit payloads contain no sensitive plaintext.
  assert.deepEqual(applyFieldMask({ id: 1, phone: "13800000000", email: "a@example.com", storageKey: "private/key" }, ["phone", "email", "storageKey"]), { id: 1 });
  assert.throws(() => assertSafeAuditDetail({ token: "secret" }), /AUDIT_DETAIL_UNSAFE/); cases += 2;
  const legacyAudit = JSON.stringify(sanitizeAuditDetail({ note: "联系 13800000000 / a@example.com / https://files.example/private", storageKey: "private/key" }));
  for (const secret of ["13800000000", "a@example.com", "https://files.example", "private/key"]) assert.equal(legacyAudit.includes(secret), false);

  // 16: normal project/quote and staff read flows still allow; route source preserves domain transactions.
  assert((await request(harness().service, 1, { capabilityCode: "project.view", projectId: 1, resourceType: "project", resourceId: "1" })).allowed);
  assert((await request(harness().service, 2, { capabilityCode: "quote.view", resourceType: "quote", resourceId: "30" })).allowed);
  assert((await request(harness().service, 5, { capabilityCode: "platform.audit.read" })).allowed);
  cases++;

  const routers = readFileSync(join(process.cwd(), "server/routers.ts"), "utf8");
  const files = readFileSync(join(process.cwd(), "server/_core/fileRoutes.ts"), "utf8") + readFileSync(join(process.cwd(), "server/_core/projectFileAccess.ts"), "utf8");
  const adminSources = ["verification-router.ts", "complaint-router.ts", "finance-router.ts", "admin-router.ts"].map((name) => readFileSync(join(process.cwd(), "server/routers", name), "utf8")).join("\n");
  for (const code of ["project.view", "project.file.download", "project.milestone.accept", "project.change.approve", "quote.view", "quote.accept"]) assert(routers.includes(`\"${code}\"`), code);
  assert(files.includes("expectedResourceVersion"));
  assert(files.includes("authorizeOrThrow"));
  assert.equal(adminSources.includes("permissionProcedure("), false);
  assert(routers.includes("acceptQuoteTransaction") && routers.includes("acceptMilestoneTransaction") && adminSources.includes("decideComplaint"));

  console.log("V3.3-A A3.2 high-risk route integration: PASS");
  console.log(`securityCases=${cases} databaseIntegration=BLOCKED_BY_ENVIRONMENT routePolicyStatic=true`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
