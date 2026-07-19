import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORIZATION_REASON_CODES,
  AuthorizationService,
  MemoryAuthorizationDataSource,
  MemoryPermissionAuditWriter,
  type MemoryAuthorizationDataset,
} from "../server/authorization";
import {
  ORGANIZATION_OWNER_CAPABILITIES,
  assertIdentityOwner,
  certificationDedupeKey,
  organizationInvitationDedupeKey,
  redactCertificationApplication,
} from "../server/services/identity-organization-domain";

const root = process.cwd();
const schema = readFileSync(join(root, "drizzle/schema.ts"), "utf8");
const identityService = readFileSync(join(root, "server/services/identity-service.ts"), "utf8");
const organizationService = readFileSync(join(root, "server/services/organization-service.ts"), "utf8");
const routerSource = readFileSync(join(root, "server/routers/identity-organization-router.ts"), "utf8");

function authorization(status: "pending" | "approved" | "revoked", membershipStatus: "active" | "suspended" | "left" | "removed" = "active", includePosition = true) {
  const dataset: MemoryAuthorizationDataset = {
    accounts: [{ id: 1, status: "active", legacyRole: "admin", currentRole: "engineer" }, { id: 2, status: "active" }],
    capabilities: [
      { code: "quote.submit", status: "active", highRisk: true, requiredCertificationCodes: ["engineer_basic"] },
      { code: "organization.update", status: "active", highRisk: true },
    ],
    identities: [{ id: 11, accountId: 1, status: "active" }],
    certifications: [{ identityId: 11, code: "engineer_basic", status }],
    organizationMemberships: [{ id: 21, accountId: 1, scopeId: 101, status: membershipStatus }],
    assignments: [
      { capabilityCode: "quote.submit", sourceType: "ACCOUNT_SELF", subjectId: 1, status: "active", dataScope: "SELF" },
      ...(includePosition ? [{ capabilityCode: "organization.update", sourceType: "ORGANIZATION_POSITION" as const, subjectId: 21, organizationId: 101, status: "active" as const, dataScope: "ORGANIZATION" as const }] : []),
    ],
    resources: [{ resourceType: "organization", resourceId: "101", status: "active", allowedStatuses: ["active"], ownerAccountId: 1, organizationId: 101, confidentiality: "INTERNAL" }],
  };
  return new AuthorizationService(new MemoryAuthorizationDataSource(dataset), new MemoryPermissionAuditWriter());
}

async function main() {
  let cases = 0;

  // Same identity and open certification are protected by deterministic keys plus database unique indexes.
  assert.equal(certificationDedupeKey(11, 7), "cert|identity:11|7");
  assert.match(schema, /business_identities_account_type_uq/);
  assert.match(schema, /certifications_active_dedupe_uq/);
  assert.match(identityService, /onDuplicateKeyUpdate/);
  cases++;

  const pending = await authorization("pending").authorize({ accountId: 1, identityId: 11, capabilityCode: "quote.submit" });
  assert.equal(pending.reasonCode, AUTHORIZATION_REASON_CODES.CERTIFICATION_INACTIVE); cases++;
  const approved = await authorization("approved").authorize({ accountId: 1, identityId: 11, capabilityCode: "quote.submit" });
  assert.equal(approved.allowed, true); cases++;
  const revoked = await authorization("revoked").authorize({ accountId: 1, identityId: 11, capabilityCode: "quote.submit" });
  assert.equal(revoked.reasonCode, AUTHORIZATION_REASON_CODES.CERTIFICATION_INACTIVE); cases++;

  // Merchant submission creates only identity/profile/certification facts and never calls organization creation.
  const merchantBlock = routerSource.slice(routerSource.indexOf("submitMerchant:"), routerSource.indexOf("export const accountProfileRouter"));
  assert.match(merchantBlock, /identityKind: "merchant"/);
  assert.doesNotMatch(merchantBlock, /createOrganization/); cases++;

  assert.throws(() => assertIdentityOwner({ accountId: 2, status: "active" }, 1), /IDENTITY_INACTIVE/); cases++;

  const crossOrg = await authorization("approved").authorize({ accountId: 2, capabilityCode: "organization.update", organizationId: 101, resourceType: "organization", resourceId: "101" });
  assert.equal(crossOrg.reasonCode, AUTHORIZATION_REASON_CODES.ORGANIZATION_MEMBERSHIP_INACTIVE); cases++;
  const noPosition = await authorization("approved", "active", false).authorize({ accountId: 1, capabilityCode: "organization.update", organizationId: 101, resourceType: "organization", resourceId: "101" });
  assert.equal(noPosition.reasonCode, AUTHORIZATION_REASON_CODES.CAPABILITY_MISSING); cases++;
  for (const status of ["suspended", "left", "removed"] as const) {
    const result = await authorization("approved", status).authorize({ accountId: 1, capabilityCode: "organization.update", organizationId: 101, resourceType: "organization", resourceId: "101" });
    assert.equal(result.reasonCode, AUTHORIZATION_REASON_CODES.ORGANIZATION_MEMBERSHIP_INACTIVE);
  }
  cases++;

  assert(ORGANIZATION_OWNER_CAPABILITIES.includes("organization.member.assign_position"));
  assert(ORGANIZATION_OWNER_CAPABILITIES.includes("organization.position.manage"));
  assert.match(organizationService, /isOwnerPosition: true/); cases++;

  const sanitized = redactCertificationApplication("merchant_business_license", {
    registrationNo: "REG-12345678", addressText: "secret street", phone: "13800000000", token: "secret", categories: ["repair"],
  });
  for (const key of ["registrationNo", "addressText", "phone", "token"]) assert.equal(key in sanitized, false);
  assert.equal(typeof sanitized.registrationNoDigest, "string"); cases++;

  assert.equal(organizationInvitationDedupeKey(5, 9), "orginv|5|account:9");
  assert.match(schema, /organization_invitations_active_dedupe_uq/);
  assert.match(schema, /organization_memberships_org_account_uq/); cases++;

  assert.match(routerSource, /authorizeOrThrow/);
  assert.doesNotMatch(routerSource, /ctx\.user\.role\s*[!=]==?/);
  assert.match(organizationService, /LAST_OWNER_CANNOT_LEAVE/); cases++;

  console.log(`A4 identity/certification/organization synthetic tests passed: ${cases} cases`);
  if (!process.env.DATABASE_URL) console.log("A4 MySQL integration: BLOCKED_BY_ENVIRONMENT (DATABASE_URL is not set)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
