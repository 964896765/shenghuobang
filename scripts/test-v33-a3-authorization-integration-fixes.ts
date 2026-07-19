import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORIZATION_REASON_CODES,
  AuthorizationService,
  MemoryAuthorizationDataSource,
  MemoryPermissionAuditWriter,
  computeFieldMask,
  type AuthorizationRequest,
  type MemoryAuthorizationDataset,
  type ResourceFact,
} from "../server/authorization";
import {
  isFileUploadInitializationRequest,
  resolveProjectRoleCapabilityAssignments,
  resolveQuoteSelfAssignment,
  resourceFieldsFor,
} from "../server/authorization/drizzle-data-source";

const membership = { id: 101, scopeId: 7 };
const explicit = (status: string, capabilityStatus = status, capabilityCode?: string) => ({
  roleCode: "engineer", capabilityCode, assignmentStatus: status, capabilityStatus, dataScope: "PROJECT",
});

function service(dataset: MemoryAuthorizationDataset) {
  const audit = new MemoryPermissionAuditWriter();
  return { audit, authorization: new AuthorizationService(new MemoryAuthorizationDataSource(dataset), audit) };
}

async function main() {
  let cases = 0;
  const source = readFileSync(join(process.cwd(), "server/authorization/drizzle-data-source.ts"), "utf8");
  const organizationBlock = source.slice(source.indexOf("if (organizationMembershipRow)"), source.indexOf("if (projectMembershipRow)"));

  // 1-2: organization-only requests neither enter project role queries nor dereference a missing project membership.
  assert.equal(organizationBlock.includes("projectMembershipRoles"), false);
  assert.equal(organizationBlock.includes("projectMembershipRow."), false);
  assert.deepEqual(resolveProjectRoleCapabilityAssignments({ membership: null, capabilityCode: "project.view", explicitFacts: [], membershipRoles: [] }), { assignments: [], compatibilityMarkers: [] });
  cases += 2;

  // 3: a project membership without an organization membership uses only the frozen minimum when no explicit current-capability fact exists.
  const frozen = resolveProjectRoleCapabilityAssignments({ membership, capabilityCode: "project.view", explicitFacts: [], membershipRoles: [{ roleCode: "engineer", status: "active" }] });
  assert.equal(frozen.assignments[0]?.status, "active");
  assert.equal(frozen.assignments[0]?.projectId, 7);
  assert(frozen.compatibilityMarkers[0]?.startsWith("compat:project-role-frozen:engineer"));
  cases++;

  // 4-5: any explicit current-capability fact wins; revoked is retained as revoked and never regains a compatibility marker.
  const active = resolveProjectRoleCapabilityAssignments({ membership, capabilityCode: "project.view", explicitFacts: [explicit("active")], membershipRoles: [{ roleCode: "engineer", status: "active" }] });
  assert.equal(active.assignments[0]?.status, "active");
  assert.deepEqual(active.compatibilityMarkers, []);
  const revoked = resolveProjectRoleCapabilityAssignments({ membership, capabilityCode: "project.view", explicitFacts: [explicit("active", "revoked")], membershipRoles: [{ roleCode: "engineer", status: "active" }] });
  assert.equal(revoked.assignments[0]?.status, "revoked");
  assert.deepEqual(revoked.compatibilityMarkers, []);
  const suspended = resolveProjectRoleCapabilityAssignments({ membership, capabilityCode: "project.view", explicitFacts: [explicit("suspended", "active")], membershipRoles: [{ roleCode: "engineer", status: "active" }] });
  assert.equal(suspended.assignments[0]?.status, "revoked");
  assert.deepEqual(suspended.compatibilityMarkers, []);
  cases += 2;

  // 6: an explicit record for another capability does not suppress the exact current-capability frozen decision.
  const unrelated = resolveProjectRoleCapabilityAssignments({ membership, capabilityCode: "project.view", explicitFacts: [explicit("active", "active", "project.file.upload")], membershipRoles: [{ roleCode: "engineer", status: "active" }] });
  assert.equal(unrelated.assignments[0]?.status, "active");
  assert.equal(unrelated.compatibilityMarkers.length, 1);
  cases++;

  // 7: all real verification resource keys expose the correct field universe; masking remains field-specific.
  const identityFields = resourceFieldsFor("verification:identity");
  const engineerFields = resourceFieldsFor("verification:engineer");
  const merchantFields = resourceFieldsFor("verification:merchant");
  assert(identityFields.includes("idNumberDigest") && identityFields.includes("realName"));
  assert(engineerFields.includes("professionalTitle") && engineerFields.includes("skills") && engineerFields.includes("realName"));
  assert(merchantFields.includes("registrationNoDigest") && merchantFields.includes("addressText"));
  assert(computeFieldMask({ availableFields: identityFields, fieldAccess: [], view: "detail" }).includes("idNumberDigest"));
  assert(computeFieldMask({ availableFields: engineerFields, fieldAccess: [], view: "detail" }).includes("realName"));
  const merchantMask = computeFieldMask({ availableFields: merchantFields, fieldAccess: [], view: "detail" });
  assert(merchantMask.includes("registrationNoDigest") && merchantMask.includes("addressText"));
  cases++;

  // 8: no-resource file access is upload-init only; missing/invalid/disabled/version-stale reads fail closed.
  const uploadRequest = { accountId: 1, capabilityCode: "file.access", purpose: "upload_file" } satisfies AuthorizationRequest;
  assert.equal(isFileUploadInitializationRequest(uploadRequest, null), true);
  assert.equal(isFileUploadInitializationRequest({ ...uploadRequest, purpose: "download" }, null), false);
  assert.equal(isFileUploadInitializationRequest({ ...uploadRequest, resourceType: "stored_file", resourceId: "bad" }, null), false);
  const fileDataset: MemoryAuthorizationDataset = {
    accounts: [{ id: 1, status: "active" }],
    capabilities: [{ code: "file.access", status: "active", highRisk: true }],
    assignments: [{ capabilityCode: "file.access", sourceType: "ACCOUNT_SELF", subjectId: 1, status: "active", dataScope: "OWNED_RESOURCE" }],
    resources: [
      { resourceType: "stored_file", resourceId: "1", status: "available", allowedStatuses: ["available"], ownerAccountId: 1, confidentiality: "RESTRICTED", version: 2 },
      { resourceType: "stored_file", resourceId: "2", status: "disabled", allowedStatuses: ["available"], ownerAccountId: 1, confidentiality: "RESTRICTED", version: 2 },
    ],
  };
  for (const resourceId of ["404", "not-a-number"]) {
    const result = await service(fileDataset).authorization.authorize({ accountId: 1, capabilityCode: "file.access", resourceType: "stored_file", resourceId });
    assert.equal(result.allowed, false);
  }
  assert.equal((await service(fileDataset).authorization.authorize({ accountId: 1, capabilityCode: "file.access", resourceType: "stored_file", resourceId: "2" })).reasonCode, AUTHORIZATION_REASON_CODES.RESOURCE_STATE_FORBIDDEN);
  assert.equal((await service(fileDataset).authorization.authorize({ accountId: 1, capabilityCode: "file.access", resourceType: "stored_file", resourceId: "1", expectedResourceVersion: 1 })).reasonCode, AUTHORIZATION_REASON_CODES.CONCURRENT_MODIFICATION);
  cases++;

  // 9: revoked facts from every source remain inactive; a compatibility observation cannot turn them into allow.
  const revokedDataset: MemoryAuthorizationDataset = {
    accounts: [{ id: 1, status: "active", legacyRole: "admin", currentRole: "engineer" }],
    capabilities: [{ code: "project.view", status: "active", highRisk: true }],
    organizationMemberships: [{ id: 10, accountId: 1, scopeId: 5, status: "active" }],
    projectMemberships: [{ id: 20, accountId: 1, scopeId: 7, status: "active" }],
    assignments: [
      { capabilityCode: "project.view", sourceType: "ORGANIZATION_POSITION", subjectId: 10, organizationId: 5, status: "revoked", dataScope: "ORGANIZATION" },
      { capabilityCode: "project.view", sourceType: "PROJECT_ROLE", subjectId: 20, projectId: 7, status: "revoked", dataScope: "PROJECT" },
      { capabilityCode: "project.view", sourceType: "PLATFORM_POSITION", subjectId: 1, platformStaffPositionId: 30, status: "revoked", dataScope: "PLATFORM_ALL" },
      { capabilityCode: "project.view", sourceType: "GRANT", subjectId: 1, status: "revoked", dataScope: "PROJECT", projectId: 7 },
    ],
    resources: [{ resourceType: "project", resourceId: "7", status: "in_progress", allowedStatuses: ["in_progress"], ownerAccountId: 1, organizationId: 5, projectId: 7, memberAccountIds: [1], confidentiality: "INTERNAL" }],
    legacyPermissions: { admin: ["compat:project-role-frozen:engineer:project.view"] },
  };
  const revokedHarness = service(revokedDataset);
  const revokedResult = await revokedHarness.authorization.authorize({ accountId: 1, capabilityCode: "project.view", organizationId: 5, projectId: 7, platformStaffPositionId: 30, resourceType: "project", resourceId: "7" });
  assert.equal(revokedResult.allowed, false);
  assert(revokedHarness.audit.events.some((event) => event.compatibilityHit?.startsWith("compat:")));
  cases++;

  // Additional constrained reviews: quote actors, row scope, membership revocation, legacy-only facts and audit redaction.
  const quote: ResourceFact = { resourceType: "quote", resourceId: "9", status: "submitted", ownerAccountId: 1, assigneeAccountId: 2, memberAccountIds: [1, 2], confidentiality: "INTERNAL" };
  assert.equal(resolveQuoteSelfAssignment({ accountId: 2, capabilityCode: "quote.accept" }, quote), null);
  assert.equal(resolveQuoteSelfAssignment({ accountId: 2, capabilityCode: "quote.reject" }, quote), null);
  assert.equal(resolveQuoteSelfAssignment({ accountId: 1, capabilityCode: "quote.accept" }, quote)?.dataScope, "OWNED_RESOURCE");

  const platformDataset: MemoryAuthorizationDataset = {
    accounts: [{ id: 8, status: "active", legacyRole: "admin", currentRole: "engineer" }],
    capabilities: [{ code: "platform.complaint.read", status: "active", highRisk: true }],
    assignments: [{ capabilityCode: "platform.complaint.read", sourceType: "PLATFORM_POSITION", subjectId: 8, platformStaffPositionId: 80, status: "active", dataScope: "PLATFORM_ASSIGNED", resourceType: "complaint", resourceId: "1" }],
    resources: [
      { resourceType: "complaint", resourceId: "1", status: "under_review", allowedStatuses: ["under_review"], confidentiality: "INTERNAL" },
      { resourceType: "complaint", resourceId: "2", status: "under_review", allowedStatuses: ["under_review"], confidentiality: "INTERNAL" },
    ],
  };
  assert((await service(platformDataset).authorization.authorize({ accountId: 8, capabilityCode: "platform.complaint.read", resourceType: "complaint", resourceId: "1" })).allowed);
  assert.equal((await service(platformDataset).authorization.authorize({ accountId: 8, capabilityCode: "platform.complaint.read", resourceType: "complaint", resourceId: "2" })).allowed, false);

  for (const status of ["suspended", "left", "removed"] as const) {
    const dataset = structuredClone(revokedDataset);
    dataset.projectMemberships![0].status = status;
    dataset.assignments = [{ capabilityCode: "project.view", sourceType: "PROJECT_ROLE", subjectId: 20, projectId: 7, status: "active", dataScope: "PROJECT" }];
    assert.equal((await service(dataset).authorization.authorize({ accountId: 1, capabilityCode: "project.view", projectId: 7, resourceType: "project", resourceId: "7" })).reasonCode, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE);
  }

  const legacyOnly = service({ accounts: [{ id: 1, status: "active", legacyRole: "admin", currentRole: "engineer" }], capabilities: [{ code: "project.view", status: "active", highRisk: true }], legacyPermissions: { admin: ["compat:project:owner:project.view"] } });
  const legacyResult = await legacyOnly.authorization.authorize({ accountId: 1, capabilityCode: "project.view", resourceType: "project", resourceId: "raw-resource-123" });
  assert.equal(legacyResult.allowed, false);
  const auditText = JSON.stringify(legacyOnly.audit.events);
  assert.equal(auditText.includes("raw-resource-123"), false);
  for (const secret of ["13800000000", "person@example.com", "https://private", "bearer-token"]) assert.equal(auditText.includes(secret), false);
  cases += 4;

  console.log("V3.3-A A3.2.1 authorization integration fixes: PASS");
  console.log(`regressionGroups=${cases} databaseIntegration=BLOCKED_BY_ENVIRONMENT`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
