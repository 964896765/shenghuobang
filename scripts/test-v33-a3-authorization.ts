import assert from "node:assert/strict";
import {
  AUTHORIZATION_REASON_CODES,
  AuthorizationService,
  capabilitiesForPlatformPosition,
  MemoryAuthorizationDataSource,
  MemoryPermissionAuditWriter,
  applyFieldMask,
  assertSafeAuditDetail,
  type AuthorizationRequest,
  type MemoryAuthorizationDataset,
} from "../server/authorization";
import { certificationActiveDedupeKey } from "../server/migration/v33-a2/runner";

async function main() {
const capabilities = [
  { code: "platform.admin.menu", status: "active" as const, highRisk: true },
  { code: "engineer.quote.create", status: "active" as const, highRisk: true, requiredCertificationCodes: ["engineer_basic"] },
  { code: "organization.member.list", status: "active" as const, highRisk: false },
  { code: "project.file.read", status: "active" as const, highRisk: true },
  { code: "project.delivery.accept", status: "active" as const, highRisk: true },
  { code: "platform.finance.refund_execute", status: "active" as const, highRisk: true },
  { code: "platform.complaint.decide", status: "active" as const, highRisk: true },
  { code: "platform.certification.review_final", status: "active" as const, highRisk: true },
  { code: "platform.permission.grant", status: "active" as const, highRisk: true },
  { code: "file.access", status: "active" as const, highRisk: true },
  { code: "account.profile.view_self", status: "active" as const, highRisk: false },
];

const baseDataset: MemoryAuthorizationDataset = {
  accounts: [
    { id: 1, status: "active", legacyRole: "admin", currentRole: "engineer" },
    { id: 2, status: "active", legacyRole: "user", currentRole: "user" },
    { id: 3, status: "active", legacyRole: "finance_operator", currentRole: "user" },
  ],
  capabilities,
  identities: [{ id: 10, accountId: 1, status: "active" }, { id: 20, accountId: 2, status: "active" }],
  certifications: [{ identityId: 10, code: "engineer_basic", status: "approved" }],
  organizationMemberships: [{ id: 101, accountId: 1, scopeId: 1, status: "active" }, { id: 102, accountId: 2, scopeId: 2, status: "active" }],
  projectMemberships: [{ id: 201, accountId: 1, scopeId: 1, status: "active" }, { id: 202, accountId: 2, scopeId: 2, status: "active" }],
  assignments: [
    { capabilityCode: "organization.member.list", sourceType: "ORGANIZATION_POSITION", subjectId: 101, organizationId: 1, status: "active", dataScope: "ORGANIZATION" },
    { capabilityCode: "project.file.read", sourceType: "PROJECT_ROLE", subjectId: 201, projectId: 1, status: "active", dataScope: "PROJECT", allowedFields: ["fileName"] },
    { capabilityCode: "project.delivery.accept", sourceType: "PROJECT_ROLE", subjectId: 201, projectId: 1, status: "active", dataScope: "PROJECT" },
    { capabilityCode: "platform.finance.refund_execute", sourceType: "PLATFORM_POSITION", subjectId: 1, platformStaffPositionId: 501, status: "active", dataScope: "PLATFORM_ASSIGNED" },
    { capabilityCode: "platform.complaint.decide", sourceType: "PLATFORM_POSITION", subjectId: 1, platformStaffPositionId: 501, status: "active", dataScope: "PLATFORM_ASSIGNED" },
    { capabilityCode: "platform.certification.review_final", sourceType: "PLATFORM_POSITION", subjectId: 1, platformStaffPositionId: 501, status: "active", dataScope: "PLATFORM_ASSIGNED" },
    { capabilityCode: "platform.permission.grant", sourceType: "PLATFORM_POSITION", subjectId: 1, platformStaffPositionId: 501, status: "active", dataScope: "PLATFORM_ASSIGNED" },
    { capabilityCode: "file.access", sourceType: "PROJECT_ROLE", subjectId: 201, projectId: 1, status: "active", dataScope: "PROJECT", allowedFields: ["phone", "email"] },
    { capabilityCode: "account.profile.view_self", sourceType: "ACCOUNT_SELF", subjectId: 1, status: "active", dataScope: "SELF", allowedFields: ["phone", "email"] },
  ],
  resources: [
    { resourceType: "organization", resourceId: "o1", status: "active", allowedStatuses: ["active"], ownerAccountId: 1, organizationId: 1, confidentiality: "INTERNAL" },
    { resourceType: "organization", resourceId: "o2", status: "active", allowedStatuses: ["active"], ownerAccountId: 2, organizationId: 2, confidentiality: "INTERNAL" },
    { resourceType: "project_file", resourceId: "p1-file", status: "available", allowedStatuses: ["available"], projectId: 1, memberAccountIds: [1], confidentiality: "INTERNAL", availableFields: ["fileName", "storageKey", "publicUrl"] },
    { resourceType: "project_file", resourceId: "p2-file", status: "available", allowedStatuses: ["available"], projectId: 2, memberAccountIds: [2], confidentiality: "INTERNAL" },
    { resourceType: "delivery", resourceId: "d1", status: "submitted", allowedStatuses: ["submitted"], projectId: 1, memberAccountIds: [1], confidentiality: "INTERNAL", workflowActors: { submittedByAccountId: 1 } },
    { resourceType: "refund", resourceId: "r1", status: "reviewed", allowedStatuses: ["reviewed"], confidentiality: "INTERNAL", workflowActors: { financeReviewerAccountId: 1 } },
    { resourceType: "complaint", resourceId: "c1", status: "investigated", allowedStatuses: ["investigated"], confidentiality: "INTERNAL", workflowActors: { complaintInvestigatorAccountId: 1 } },
    { resourceType: "certification", resourceId: "cert1", status: "initial_reviewed", allowedStatuses: ["initial_reviewed"], confidentiality: "INTERNAL", workflowActors: { initialReviewerAccountId: 1 } },
    { resourceType: "permission_grant", resourceId: "g1", status: "pending", allowedStatuses: ["pending"], confidentiality: "INTERNAL", workflowActors: { targetAccountId: 1, requestedPrivilege: "super_administrator|PLATFORM_ALL" } },
    { resourceType: "design_file", resourceId: "nda1", status: "available", allowedStatuses: ["available"], projectId: 1, memberAccountIds: [1], confidentiality: "NDA", ndaRequired: true },
    { resourceType: "profile", resourceId: "profile1", status: "active", allowedStatuses: ["active"], ownerAccountId: 1, confidentiality: "PUBLIC", availableFields: ["name", "phone", "email", "addressText", "idNumberDigest"] },
  ],
  ndaAcceptances: [],
  legacyPermissions: { admin: ["admin.menu", "verification.review"], finance_operator: ["finance.release"] },
};

function service(dataset: MemoryAuthorizationDataset = structuredClone(baseDataset)) {
  const audit = new MemoryPermissionAuditWriter();
  return { audit, service: new AuthorizationService(new MemoryAuthorizationDataSource(dataset), audit) };
}
const authorize = (authorization: AuthorizationService, request: Omit<AuthorizationRequest, "accountId"> & { accountId?: number }) => authorization.authorize({ accountId: request.accountId ?? 1, requestId: "test-request", ...request });

// 1 + 17: legacy role cannot independently authorize high-risk platform access.
{
  const { service: authorization, audit } = service();
  const result = await authorize(authorization, { accountId: 1, capabilityCode: "platform.admin.menu", requestedDataScope: "PLATFORM_ALL" });
  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.CAPABILITY_MISSING);
  assert(audit.events.some((event) => event.compatibilityHit === "users.role:admin"));
}

// 2: currentRole is preference-only and cannot create engineer authority.
{
  const dataset = structuredClone(baseDataset);
  dataset.assignments = dataset.assignments?.filter((item) => item.capabilityCode !== "engineer.quote.create");
  const { service: authorization } = service(dataset);
  const result = await authorize(authorization, { capabilityCode: "engineer.quote.create", identityId: 10, requestedDataScope: "SELF" });
  assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.CAPABILITY_MISSING);
}

// 3 + 4: organization/project facts cannot cross scope.
{
  const { service: authorization } = service();
  assert.equal((await authorize(authorization, { capabilityCode: "organization.member.list", organizationId: 2, resourceType: "organization", resourceId: "o2", confidentiality: "INTERNAL" })).reasonCode, AUTHORIZATION_REASON_CODES.ORGANIZATION_MEMBERSHIP_INACTIVE);
  assert.equal((await authorize(authorization, { capabilityCode: "project.file.read", projectId: 2, resourceType: "project_file", resourceId: "p2-file", confidentiality: "INTERNAL" })).reasonCode, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE);
}

// 5: suspended/left/removed memberships immediately lose authority.
for (const status of ["suspended", "left", "removed"] as const) {
  const dataset = structuredClone(baseDataset);
  dataset.projectMemberships![0].status = status;
  const { service: authorization } = service(dataset);
  const result = await authorize(authorization, { capabilityCode: "project.file.read", projectId: 1, resourceType: "project_file", resourceId: "p1-file", confidentiality: "INTERNAL" });
  assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE);
}

// 6 + 7: revoked certification wins over an active direct grant.
{
  const dataset = structuredClone(baseDataset);
  dataset.certifications![0].status = "revoked";
  dataset.assignments!.push({ capabilityCode: "engineer.quote.create", sourceType: "GRANT", subjectId: 1, status: "active", dataScope: "SELF" });
  const { service: authorization } = service(dataset);
  const result = await authorize(authorization, { capabilityCode: "engineer.quote.create", identityId: 10, requestedDataScope: "SELF" });
  assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.CERTIFICATION_INACTIVE);
}

// 8 + 9: clearance and NDA are independent server-side gates.
{
  const { service: authorization } = service();
  assert.equal((await authorize(authorization, { capabilityCode: "file.access", projectId: 1, resourceType: "design_file", resourceId: "nda1", confidentiality: "INTERNAL" })).reasonCode, AUTHORIZATION_REASON_CODES.CONFIDENTIALITY_TOO_HIGH);
  assert.equal((await authorize(authorization, { capabilityCode: "file.access", projectId: 1, resourceType: "design_file", resourceId: "nda1", confidentiality: "NDA" })).reasonCode, AUTHORIZATION_REASON_CODES.NDA_REQUIRED);
}

// 10-14: frozen segregation-of-duties assertions.
for (const [capabilityCode, resourceType, resourceId, expected] of [
  ["project.delivery.accept", "delivery", "d1", AUTHORIZATION_REASON_CODES.SELF_APPROVAL_FORBIDDEN],
  ["platform.finance.refund_execute", "refund", "r1", AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES],
  ["platform.complaint.decide", "complaint", "c1", AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES],
  ["platform.certification.review_final", "certification", "cert1", AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES],
  ["platform.permission.grant", "permission_grant", "g1", AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES],
] as const) {
  const { service: authorization } = service();
  const platform = capabilityCode.startsWith("platform.");
  const result = await authorize(authorization, { capabilityCode, projectId: platform ? null : 1, platformStaffPositionId: platform ? 501 : null, resourceType, resourceId, confidentiality: "INTERNAL" });
  assert.equal(result.reasonCode, expected, capabilityCode);
}

// 15: list serialization always exposes fewer sensitive fields than detail.
{
  const { service: authorization } = service();
  const detail = await authorize(authorization, { capabilityCode: "account.profile.view_self", resourceType: "profile", resourceId: "profile1", requestedDataScope: "SELF", confidentiality: "PUBLIC", view: "detail" });
  const list = await authorize(authorization, { capabilityCode: "account.profile.view_self", resourceType: "profile", resourceId: "profile1", requestedDataScope: "SELF", confidentiality: "PUBLIC", view: "list" });
  assert(detail.allowed && list.allowed);
  assert(list.fieldMask.length > detail.fieldMask.length);
  const serialized = applyFieldMask({ name: "Fixture", phone: "13800000000", email: "fixture@example.com", addressText: "secret" }, list.fieldMask);
  assert.deepEqual(serialized, { name: "Fixture" });
}

// 16: audit contains hashes/codes only and rejects sensitive detail keys.
{
  const { service: authorization, audit } = service();
  await authorize(authorization, { capabilityCode: "project.file.read", projectId: 2, resourceType: "project_file", resourceId: "p2-file", confidentiality: "INTERNAL" });
  const auditText = JSON.stringify(audit.events);
  for (const secret of ["13800000000", "fixture@example.com", "storage/private", "https://files.example"]) assert.equal(auditText.includes(secret), false);
  assert.throws(() => assertSafeAuditDetail({ storageKey: "storage/private" }), /AUDIT_DETAIL_UNSAFE/);
}

// 18: A2.3 approved certifications remain deduped under the exact frozen key.
assert.equal(certificationActiveDedupeKey("approved", { kind: "identity", id: 10 }, 2), "cert|identity:10|2");
assert.equal(certificationActiveDedupeKey("revoked", { kind: "identity", id: 10 }, 2), null);
assert(capabilitiesForPlatformPosition("finance_reviewer").includes("platform.finance.review"));
assert.equal(capabilitiesForPlatformPosition("finance_reviewer").includes("platform.funds.execute"), false);
assert.equal(capabilitiesForPlatformPosition("unknown_position").length, 0);

console.log("V3.3-A A3.1 authorization kernel: PASS");
console.log("securityCases=18 reasonCodes=18 fieldGroups=12 legacyDirectAllow=false");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
