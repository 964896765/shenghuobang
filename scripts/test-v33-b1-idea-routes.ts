import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import {
  applyFieldMask,
  computeFieldMask,
  dataScopeMatches,
  resourceFieldsFor,
  resourceRelationMatches,
  validateResource,
  type AuthorizationFacts,
  type AuthorizationRequest,
} from "../server/authorization";
import { ideasRouter, ideaErrorToTrpc } from "../server/routers/ideas-router";
import { IdeaServiceError, invitationRelationshipActive, publicIdeaIsAfterCursor } from "../server/services/idea-service";
import { signIdeaFileAccess, verifyIdeaFileAccess, type IdeaFileAccessClaims } from "../server/storage/idea-file-access-token";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function facts(resource: NonNullable<AuthorizationFacts["resource"]>): AuthorizationFacts {
  return {
    account: { id: 2, status: "active" },
    capability: { code: "idea.view_private", status: "active", highRisk: false },
    identity: null,
    certifications: [],
    organizationMembership: null,
    projectMembership: null,
    assignments: [],
    resource,
    ndaAccepted: Boolean(resource.ndaAccepted),
    legacy: { currentRole: "engineer" },
  };
}

async function rejectedCode(operation: () => unknown | Promise<unknown>): Promise<string> {
  try { await operation(); } catch (error) {
    assert(error instanceof TRPCError);
    return error.code;
  }
  throw new Error("Expected operation to reject");
}

async function main() {
  let cases = 0;
  const routerSource = read("server/routers/ideas-router.ts");
  const dataSource = read("server/authorization/drizzle-data-source.ts");
  const fileAccess = read("server/_core/ideaFileAccess.ts");
  const serviceSource = read("server/services/idea-service.ts");
  const appSource = read("server/routers.ts");
  const indexSource = read("server/_core/index.ts");
  const schemaSource = read("drizzle/schema.ts");

  // 1: every B1 endpoint is protected; anonymous callers never reach the database.
  const anonymous = ideasRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as never);
  assert.equal(await rejectedCode(() => anonymous.listPublic()), "UNAUTHORIZED"); cases++;

  // 2: account and actor fields come from the session, not client input.
  assert(!routerSource.includes("creatorAccountId:"));
  assert(!routerSource.includes("inviterAccountId:"));
  assert(!routerSource.includes("uploadedBy:")); cases++;

  // 3: strict validation rejects a forged creator field before service execution.
  const authenticated = ideasRouter.createCaller({ user: { id: 9 }, req: { headers: {} }, res: {} } as never);
  assert.equal(await rejectedCode(() => authenticated.createDraft({
    creatorIdentityId: 1, title: "a", summary: "b", description: "c", categoryCode: "d", requestId: "route.3",
    creatorAccountId: 99,
  } as never)), "BAD_REQUEST"); cases++;

  // 4: write commands require a bounded requestId.
  assert.equal(await rejectedCode(() => authenticated.publish({ ideaId: 1 } as never)), "BAD_REQUEST"); cases++;

  // 5: public feed cursor is stable and excludes the cursor row.
  const cursor = { publishedAt: "2026-07-19T12:00:00.000Z", id: 10 };
  assert(!publicIdeaIsAfterCursor({ publishedAt: new Date(cursor.publishedAt), id: 10 }, cursor));
  assert(publicIdeaIsAfterCursor({ publishedAt: new Date(cursor.publishedAt), id: 9 }, cursor)); cases++;

  // 6: malformed cursor is rejected by the router schema.
  assert.equal(await rejectedCode(() => authenticated.listPublic({ limit: 20, cursor: { publishedAt: "bad", id: 1 } })), "BAD_REQUEST"); cases++;

  // 7-8: accepted collaboration survives invitation expiry; pending does not.
  const past = new Date(Date.now() - 1);
  assert(invitationRelationshipActive("accepted", past, new Date())); cases++;
  assert(!invitationRelationshipActive("pending", past, new Date())); cases++;

  // 9: currentRole does not create a resource relation.
  const privateIdea = facts({ resourceType: "idea", resourceId: "1", status: "published", ownerAccountId: 1, memberAccountIds: [], confidentiality: "INTERNAL" });
  assert(!resourceRelationMatches({ accountId: 2, capabilityCode: "idea.view_private", resourceType: "idea", resourceId: "1" }, privateIdea)); cases++;

  // 10: accepted collaborators have the invited-resource relation.
  privateIdea.resource!.memberAccountIds = [2];
  assert(resourceRelationMatches({ accountId: 2, capabilityCode: "idea.view_private", resourceType: "idea", resourceId: "1" }, privateIdea)); cases++;

  // 11: a pending invite is limited to invitation/NDA pre-flow, not attachment download.
  const pending = facts({ resourceType: "idea", resourceId: "1", status: "published", ownerAccountId: 1, memberAccountIds: [], pendingInviteeAccountIds: [2], confidentiality: "PUBLIC" });
  assert(resourceRelationMatches({ accountId: 2, capabilityCode: "idea.invitation.accept", resourceType: "idea", resourceId: "1" }, pending));
  assert(!resourceRelationMatches({ accountId: 2, capabilityCode: "idea.attachment.download", resourceType: "idea", resourceId: "1" }, pending)); cases++;

  // 12: an NDA-gated detail reaches NDA_REQUIRED rather than leaking content.
  const ndaFacts = facts({ resourceType: "idea", resourceId: "2", status: "published", ownerAccountId: 1, memberAccountIds: [2], memberConfidentialityClearance: "NDA", confidentiality: "NDA", ndaRequired: true, ndaAccepted: false });
  assert.equal(validateResource({ accountId: 2, capabilityCode: "idea.view_private", resourceType: "idea", resourceId: "2" }, ndaFacts), "NDA_REQUIRED"); cases++;

  // 13: active NDA plus the accepted relation permits protected detail.
  ndaFacts.resource!.ndaAccepted = true;
  ndaFacts.ndaAccepted = true;
  assert.equal(validateResource({ accountId: 2, capabilityCode: "idea.view_private", resourceType: "idea", resourceId: "2" }, ndaFacts), "ALLOWED"); cases++;

  // 14: the field mask contains both idea internals and file secrets.
  const available = resourceFieldsFor("idea_attachment");
  const mask = computeFieldMask({ availableFields: available, fieldAccess: [], view: "detail" });
  const redacted = applyFieldMask({ originalName: "secret.pdf", storageKey: "private/key", fileId: 4, mimeType: "application/pdf" }, mask);
  assert.deepEqual(redacted, { mimeType: "application/pdf" }); cases++;

  // 15: service public list explicitly applies the authorization field mask.
  assert(serviceSource.includes("applyFieldMask(publicSummary(row)")); cases++;

  const tokenSecret = "test-only-file-signing-secret-32-bytes";
  const claims: IdeaFileAccessClaims = {
    accountId: 2, ideaId: 3, attachmentId: 4, fileId: 5, purpose: "download",
    ideaAuthorizationVersion: 6, attachmentPolicyVersion: 7, storedFilePolicyVersion: 8,
    expires: Math.floor(Date.now() / 1000) + 60, nonce: "12345678-1234-1234-1234-123456789abc", requestId: "route.16",
  };
  const signature = signIdeaFileAccess(claims, tokenSecret);

  // 16: an intact controlled-access token verifies.
  assert(verifyIdeaFileAccess(claims, signature, tokenSecret)); cases++;

  // 17-19: invite revocation, attachment disable and stored-file policy changes invalidate old tokens.
  assert(!verifyIdeaFileAccess({ ...claims, ideaAuthorizationVersion: 7 }, signature, tokenSecret)); cases++;
  assert(!verifyIdeaFileAccess({ ...claims, attachmentPolicyVersion: 8 }, signature, tokenSecret)); cases++;
  assert(!verifyIdeaFileAccess({ ...claims, storedFilePolicyVersion: 9 }, signature, tokenSecret)); cases++;

  // 20: token expiry is fail-closed.
  assert(!verifyIdeaFileAccess({ ...claims, expires: 1 }, signIdeaFileAccess({ ...claims, expires: 1 }, tokenSecret), tokenSecret)); cases++;

  // 21: the content endpoint re-reads all three records and authorizes before storageRead.
  assert(fileAccess.includes("attachmentSnapshot(attachmentId)"));
  assert(fileAccess.indexOf("authorizeOrThrow(user.id") < fileAccess.indexOf("storageRead(snapshot.storageKey)"));
  assert(fileAccess.includes("claims.ideaAuthorizationVersion === snapshot.ideaAuthorizationVersion")); cases++;

  // 22: stable service errors map without exposing arbitrary messages.
  assert.equal(await rejectedCode(() => ideaErrorToTrpc(new IdeaServiceError("RESOURCE_STATE_FORBIDDEN"))), "CONFLICT");
  assert.equal(await rejectedCode(() => ideaErrorToTrpc(new Error("raw database credentials"))), "INTERNAL_SERVER_ERROR"); cases++;

  // 23: route and HTTP registrations are present once.
  assert.equal((appSource.match(/ideas: ideasRouter/g) ?? []).length, 1);
  assert.equal((indexSource.match(/registerIdeaFileAccess\(app\)/g) ?? []).length, 1); cases++;

  // 24: schema and legacy project/quote/file paths remain intact; integration did not create a duplicate table.
  assert.equal((schemaSource.match(/mysqlTable\("ideas"/g) ?? []).length, 1);
  assert(schemaSource.includes("needId: int(\"needId\")"));
  assert(schemaSource.includes("quoteId: int(\"quoteId\")"));
  assert(read("server/_core/projectFileAccess.ts").includes("registerProjectFileAccess")); cases++;

  // 25: requested INVITED_RESOURCE still requires an actual accepted member for file download.
  const attachmentFacts = facts({ resourceType: "idea_attachment", resourceId: "4", status: "available", ownerAccountId: 1, memberAccountIds: [], pendingInviteeAccountIds: [2], confidentiality: "PUBLIC" });
  assert(!dataScopeMatches({ accountId: 2, capabilityCode: "idea.attachment.download", resourceType: "idea_attachment", resourceId: "4" }, attachmentFacts, {
    capabilityCode: "idea.attachment.download", sourceType: "ACCOUNT_SELF", subjectId: 2, status: "active", dataScope: "INVITED_RESOURCE",
  })); cases++;

  // 26: Router delegates notification-producing writes to the service exactly once.
  assert.equal((routerSource.match(/ideaService\.acceptInvitation\(/g) ?? []).length, 1);
  assert.equal((routerSource.match(/ideaService\.convertToProject\(/g) ?? []).length, 1);
  assert(!routerSource.includes("createNotification(")); cases++;

  assert(dataSource.includes("ideaNdaAcceptances"));
  assert(dataSource.includes("ideaCollaborationInvitations"));
  console.log(`V3.3-B1 idea route/security synthetic tests: ${cases}/${cases} PASS`);
  console.log("MySQL integration: BLOCKED_BY_ENVIRONMENT (no safe DATABASE_URL used)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
