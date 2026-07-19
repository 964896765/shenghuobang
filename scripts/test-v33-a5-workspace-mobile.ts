import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthorizationService, MemoryAuthorizationDataSource, MemoryPermissionAuditWriter } from "../server/authorization";
import {
  compatibilityRoleForWorkspace,
  identityWorkspaceAvailability,
  organizationWorkspaceAvailability,
} from "../server/services/identity-organization-domain";

const root = process.cwd();
const workspaceService = readFileSync(join(root, "server/services/workspace-service.ts"), "utf8");
const profilePage = readFileSync(join(root, "app/(tabs)/profile.tsx"), "utf8");
const workspacePage = readFileSync(join(root, "app/workspaces.tsx"), "utf8");
const organizationPage = readFileSync(join(root, "app/organizations/index.tsx"), "utf8");
const engineerPage = readFileSync(join(root, "app/engineer-apply.tsx"), "utf8");
const merchantPage = readFileSync(join(root, "app/merchant-apply.tsx"), "utf8");

async function main() {
  let cases = 0;
  const noAuthority = new AuthorizationService(new MemoryAuthorizationDataSource({
    accounts: [{ id: 1, status: "active", currentRole: "engineer", legacyRole: "admin" }],
    capabilities: [{ code: "quote.submit", status: "active", highRisk: true, requiredCertificationCodes: ["engineer_basic"] }],
    assignments: [],
  }), new MemoryPermissionAuditWriter());
  assert.equal((await noAuthority.authorize({ accountId: 1, capabilityCode: "quote.submit" })).allowed, false); cases++;

  assert.equal(compatibilityRoleForWorkspace({ workspaceType: "identity", identityTypeCode: "engineer" }), "engineer");
  assert.equal(compatibilityRoleForWorkspace({ workspaceType: "organization", identityTypeCode: "merchant" }), "user"); cases++;

  assert.deepEqual(identityWorkspaceAvailability({ identity: { accountId: 2, status: "active" }, accountId: 1 }), { available: false, reasonCode: "IDENTITY_INACTIVE" }); cases++;
  assert.deepEqual(identityWorkspaceAvailability({ identity: { accountId: 1, status: "suspended" }, accountId: 1 }), { available: false, reasonCode: "IDENTITY_INACTIVE" }); cases++;
  for (const certificationStatus of ["revoked", "expired"]) assert.equal(identityWorkspaceAvailability({ identity: { accountId: 1, status: "active" }, accountId: 1, certificationStatus }).available, false);
  cases++;
  assert.equal(organizationWorkspaceAvailability({ membership: { accountId: 1, status: "removed" }, accountId: 1, organizationStatus: "active" }).reasonCode, "ORGANIZATION_MEMBERSHIP_INACTIVE"); cases++;
  assert.equal(identityWorkspaceAvailability({ identity: { accountId: 1, status: "active" }, accountId: 1, certificationStatus: "approved" }).available, true);
  assert.equal(organizationWorkspaceAvailability({ membership: { accountId: 1, status: "active" }, accountId: 1, organizationStatus: "active" }).available, true); cases++;

  assert.match(workspaceService, /workspacePreferences/);
  assert.match(workspaceService, /businessIdentities\.accountId, accountId/);
  assert.match(workspaceService, /membership\.status/); cases++;
  assert.match(workspacePage, /utils\.workspace\.invalidate/);
  assert.match(workspacePage, /utils\.identity\.invalidate/);
  assert.match(workspacePage, /utils\.certification\.invalidate/);
  assert.match(workspacePage, /utils\.admin\.invalidate/); cases++;

  assert.match(profilePage, /certificationQuery\.data/);
  assert.doesNotMatch(profilePage, /user\.role\s*!==\s*"user"/);
  assert.match(workspacePage, /CERTIFICATION_INACTIVE/); cases++;

  assert.match(merchantPage, /trpc\.certification\.submitMerchant/);
  assert.doesNotMatch(merchantPage, /organization\.create/);
  assert.match(organizationPage, /创建组织是独立动作/); cases++;

  assert.match(workspacePage, /query\.isLoading/);
  assert.match(workspacePage, /query\.isError/);
  assert.match(workspacePage, /暂无可用工作台/);
  assert.match(workspacePage, /query\.refetch/);
  assert.match(engineerPage, /trpc\.certification\.submitEngineer/); cases++;

  for (const source of [workspacePage, organizationPage, engineerPage, merchantPage]) {
    assert.doesNotMatch(source, /registrationNoDigest|idNumberDigest|storageKey|tokenDigest/);
    assert.doesNotMatch(source, /console\.log\(/);
  }
  cases++;

  console.log(`A5 workspace/mobile synthetic tests passed: ${cases} cases`);
  if (!process.env.DATABASE_URL) console.log("A5 MySQL integration: BLOCKED_BY_ENVIRONMENT (DATABASE_URL is not set)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
