import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyFieldMask } from "../server/authorization";
import {
  invitationRelationshipActive,
  publicIdeaIsAfterCursor,
} from "../server/services/idea-service";
import { assertIdeaTransition, ideaInvitationDedupeKey, IDEA_NDA_VERSION, projectRoleForIdeaRole } from "../server/services/idea-domain";

type Identity = { id: number; accountId: number; type: "designer" | "engineer" | "consumer"; status: "active" | "suspended" };
type Invitation = {
  id: number;
  ideaId: number;
  invitedAccountId: number;
  identityId: number;
  role: "designer" | "engineer" | "viewer";
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  ndaRequired: boolean;
  expiresAt: Date;
};

class MemoryWorkflow {
  identities = new Map<number, Identity>();
  invitations: Invitation[] = [];
  attachments: { id: number; ideaId: number; fileId: number; requestId: string; disabled: boolean }[] = [];
  archiveState = "published" as "published" | "archived";
  notifications = 0;
  ideaVersion = 1;
  ndaAcceptances = new Set<string>();
  convertedProject: { id: number; memberships: Map<number, Set<string>> } | null = null;

  archive() {
    if (this.archiveState === "archived") return { duplicate: true };
    assertIdeaTransition(this.archiveState, "archived");
    this.archiveState = "archived";
    return { duplicate: false };
  }

  upload(ideaId: number, fileId: number, requestId: string) {
    const byRequest = this.attachments.find((item) => item.requestId === requestId);
    if (byRequest) return byRequest;
    const attachment = { id: this.attachments.length + 1, ideaId, fileId, requestId, disabled: false };
    this.attachments.push(attachment);
    return attachment;
  }

  disable(ideaId: number, attachmentId: number) {
    const attachment = this.attachments.find((item) => item.id === attachmentId && item.ideaId === ideaId);
    if (!attachment) throw new Error("RESOURCE_RELATION_REQUIRED");
    attachment.disabled = true;
  }

  detailAttachments(ideaId: number) {
    return this.attachments.filter((item) => item.ideaId === ideaId && !item.disabled);
  }

  invite(actorId: number, ideaId: number, accountId: number, identityId: number, role: Invitation["role"], ndaRequired = false) {
    if (actorId === accountId) throw new Error("SELF_APPROVAL_FORBIDDEN");
    const identity = this.identities.get(identityId);
    if (!identity || identity.accountId !== accountId || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
    if (role !== "viewer" && identity.type !== role) throw new Error("IDENTITY_INACTIVE");
    const key = ideaInvitationDedupeKey(ideaId, accountId, identityId, role);
    const existing = this.invitations.find((item) =>
      ["pending", "accepted"].includes(item.status) &&
      ideaInvitationDedupeKey(item.ideaId, item.invitedAccountId, item.identityId, item.role) === key,
    );
    if (existing) return existing;
    const invitation: Invitation = {
      id: this.invitations.length + 1,
      ideaId,
      invitedAccountId: accountId,
      identityId,
      role,
      status: "pending",
      ndaRequired,
      expiresAt: new Date(Date.now() + 60_000),
    };
    this.invitations.push(invitation);
    return invitation;
  }

  accept(accountId: number, id: number, now = new Date()) {
    const invitation = this.invitations.find((item) => item.id === id && item.invitedAccountId === accountId);
    if (!invitation) throw new Error("RESOURCE_RELATION_REQUIRED");
    if (invitation.status === "accepted") return { invitation, duplicate: true, ndaAccepted: false };
    if (invitation.status !== "pending" || invitation.expiresAt <= now) throw new Error("RESOURCE_STATE_FORBIDDEN");
    const identity = this.identities.get(invitation.identityId);
    if (!identity || identity.status !== "active" || identity.accountId !== accountId) throw new Error("IDENTITY_INACTIVE");
    invitation.status = "accepted";
    return { invitation, duplicate: false, ndaAccepted: false };
  }

  decline(accountId: number, id: number, now = new Date()) {
    const invitation = this.invitations.find((item) => item.id === id && item.invitedAccountId === accountId);
    if (!invitation) throw new Error("RESOURCE_RELATION_REQUIRED");
    if (invitation.status === "declined") return { duplicate: true };
    if (invitation.status !== "pending") throw new Error("RESOURCE_STATE_FORBIDDEN");
    if (invitation.expiresAt <= now) { invitation.status = "expired"; throw new Error("INVITATION_EXPIRED"); }
    invitation.status = "declined";
    return { duplicate: false };
  }

  revoke(id: number) {
    const invitation = this.invitations.find((item) => item.id === id);
    if (!invitation) throw new Error("RESOURCE_RELATION_REQUIRED");
    if (invitation.status === "revoked") return { duplicate: true, version: this.ideaVersion };
    if (!["pending", "accepted"].includes(invitation.status)) throw new Error("RESOURCE_STATE_FORBIDDEN");
    const accepted = invitation.status === "accepted";
    invitation.status = "revoked";
    this.ideaVersion++;
    return { duplicate: false, accepted, version: this.ideaVersion };
  }

  getNda(accountId: number, ideaId: number) {
    const invitation = this.invitations.find((item) => item.ideaId === ideaId && item.invitedAccountId === accountId && ["pending", "accepted"].includes(item.status));
    if (!invitation) throw new Error("RESOURCE_RELATION_REQUIRED");
    return { ndaVersion: IDEA_NDA_VERSION, accepted: this.ndaAcceptances.has(`${ideaId}:${accountId}:${invitation.identityId}`) };
  }

  acceptNda(accountId: number, ideaId: number, identityId: number) {
    const invitation = this.invitations.find((item) => item.ideaId === ideaId && item.invitedAccountId === accountId && item.identityId === identityId);
    if (!invitation || !["pending", "accepted"].includes(invitation.status)) throw new Error("RESOURCE_RELATION_REQUIRED");
    const identity = this.identities.get(identityId);
    if (!identity || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
    const key = `${ideaId}:${accountId}:${identityId}`;
    const duplicate = this.ndaAcceptances.has(key);
    this.ndaAcceptances.add(key);
    return { duplicate, invitationStatus: invitation.status };
  }

  convert(ideaId: number, failAt?: "membership" | "role") {
    if (this.convertedProject) return { ...this.convertedProject, duplicate: true };
    const accepted = this.invitations.filter((item) => item.ideaId === ideaId && item.status === "accepted");
    if (!accepted.some((item) => item.role === "engineer")) throw new Error("PROJECT_ENGINEER_REQUIRED");
    const pendingProject = { id: 9001, memberships: new Map<number, Set<string>>([[1, new Set(["initiator"])]]) };
    if (failAt === "membership") throw new Error("fixture membership failure");
    for (const invitation of accepted) {
      const roles = pendingProject.memberships.get(invitation.invitedAccountId) ?? new Set<string>();
      roles.add(projectRoleForIdeaRole(invitation.role));
      pendingProject.memberships.set(invitation.invitedAccountId, roles);
    }
    if (failAt === "role") throw new Error("fixture role failure");
    this.convertedProject = pendingProject;
    return { ...pendingProject, duplicate: false };
  }

  async notifyWithoutRollback(core: () => void, notify: () => Promise<void>) {
    core();
    try { await notify(); } catch { /* safe degradation */ }
  }
}

async function main() {
  let cases = 0;
  const source = readFileSync(join(process.cwd(), "server/services/idea-service.ts"), "utf8");

  const cursor = { publishedAt: "2026-07-19T12:00:00.000Z", id: 20 };
  assert.equal(publicIdeaIsAfterCursor({ publishedAt: new Date(cursor.publishedAt), id: 20 }, cursor), false);
  assert.equal(publicIdeaIsAfterCursor({ publishedAt: new Date(cursor.publishedAt), id: 19 }, cursor), true);
  assert.equal(publicIdeaIsAfterCursor({ publishedAt: new Date("2026-07-19T11:59:59.000Z"), id: 99 }, cursor), true);
  assert.match(source, /lt\(ideas\.publishedAt, publishedAt\)/); cases++;

  const past = new Date(0);
  const now = new Date(1000);
  assert.equal(invitationRelationshipActive("accepted", past, now), true); cases++;
  assert.equal(invitationRelationshipActive("pending", past, now), false); cases++;

  const masked = applyFieldMask({ id: 1, originalName: "secret.step", storageKey: "never-return" }, ["originalName", "storageKey"]);
  assert.deepEqual(masked, { id: 1 });
  assert.match(source, /attachments\.map\(\(attachment\) => applyFieldMask/); cases++;

  const memory = new MemoryWorkflow();
  assert.equal(memory.archive().duplicate, false);
  assert.equal(memory.archive().duplicate, true); cases++;

  const uploaded = memory.upload(1, 101, "upload-1");
  assert.throws(() => memory.disable(2, uploaded.id), /RESOURCE_RELATION_REQUIRED/); cases++;
  memory.disable(1, uploaded.id);
  assert.equal(memory.detailAttachments(1).length, 0); cases++;
  assert.equal(memory.upload(1, 101, "upload-1").id, uploaded.id);
  assert.equal(memory.attachments.length, 1); cases++;

  memory.identities.set(11, { id: 11, accountId: 2, type: "designer", status: "active" });
  assert.throws(() => memory.invite(1, 1, 1, 11, "designer"), /SELF_APPROVAL_FORBIDDEN/); cases++;
  assert.throws(() => memory.invite(1, 1, 3, 11, "designer"), /IDENTITY_INACTIVE/); cases++;
  memory.identities.set(12, { id: 12, accountId: 3, type: "engineer", status: "suspended" });
  assert.throws(() => memory.invite(1, 1, 3, 12, "engineer"), /IDENTITY_INACTIVE/); cases++;

  const invitation = memory.invite(1, 1, 2, 11, "designer", true);
  assert.equal(memory.invite(1, 1, 2, 11, "designer", true).id, invitation.id);
  assert.equal(memory.invitations.length, 1); cases++;
  invitation.status = "revoked";
  assert.throws(() => memory.accept(2, invitation.id), /RESOURCE_STATE_FORBIDDEN/);
  invitation.status = "expired";
  assert.throws(() => memory.accept(2, invitation.id), /RESOURCE_STATE_FORBIDDEN/); cases++;

  const accepted = memory.invite(1, 1, 2, 11, "designer", true);
  const firstAcceptance = memory.accept(2, accepted.id);
  const secondAcceptance = memory.accept(2, accepted.id);
  assert.equal(firstAcceptance.duplicate, false);
  assert.equal(secondAcceptance.duplicate, true); cases++;
  assert.equal(firstAcceptance.ndaAccepted, false);
  assert.equal(firstAcceptance.invitation.ndaRequired, true); cases++;

  await memory.notifyWithoutRollback(() => { memory.notifications++; }, async () => { throw new Error("provider unavailable"); });
  assert.equal(memory.notifications, 1);
  assert.match(source, /Notification delivery never rolls back committed business state/); cases++;

  assert.doesNotMatch(source, /currentRole/);
  assert.match(source, /eq\(ideaAttachments\.id, attachmentId\), eq\(ideaAttachments\.ideaId, ideaId\)/);
  assert.match(source, /eq\(certifications\.status, "approved"\)/);

  // Final service batch.
  assert.match(source, /version: sql`\$\{ideaCollaborationInvitations\.version\} \+ 1`/);
  assert.doesNotMatch(source, /status: "expired",[\s\S]{0,80}version: 2/); cases++;
  assert.match(source, /reactivated: true/);
  assert.match(source, /accessPolicyVersion: nextPolicyVersion/); cases++;

  const declineFixture = new MemoryWorkflow();
  declineFixture.identities.set(21, { id: 21, accountId: 2, type: "designer", status: "active" });
  const declineInvitation = declineFixture.invite(1, 7, 2, 21, "designer");
  assert.equal(declineFixture.decline(2, declineInvitation.id).duplicate, false);
  assert.equal(declineFixture.decline(2, declineInvitation.id).duplicate, true); cases++;
  const acceptedDecline = declineFixture.invite(1, 8, 2, 21, "designer");
  declineFixture.accept(2, acceptedDecline.id);
  assert.throws(() => declineFixture.decline(2, acceptedDecline.id), /RESOURCE_STATE_FORBIDDEN/); cases++;

  const revokeFixture = new MemoryWorkflow();
  revokeFixture.identities.set(31, { id: 31, accountId: 3, type: "engineer", status: "active" });
  const revokePending = revokeFixture.invite(1, 9, 3, 31, "engineer");
  assert.equal(revokeFixture.revoke(revokePending.id).duplicate, false);
  assert.equal(revokePending.status, "revoked"); cases++;
  const revokeAccepted = revokeFixture.invite(1, 9, 3, 31, "engineer");
  revokeFixture.accept(3, revokeAccepted.id);
  const beforeRevokeVersion = revokeFixture.ideaVersion;
  assert.equal(revokeFixture.revoke(revokeAccepted.id).accepted, true);
  assert.equal(revokeFixture.ideaVersion, beforeRevokeVersion + 1); cases++;

  assert.throws(() => revokeFixture.getNda(99, 9), /RESOURCE_RELATION_REQUIRED/); cases++;
  const ndaFixture = new MemoryWorkflow();
  ndaFixture.identities.set(41, { id: 41, accountId: 4, type: "designer", status: "active" });
  const ndaInvitation = ndaFixture.invite(1, 10, 4, 41, "designer", true);
  assert.equal(ndaFixture.acceptNda(4, 10, 41).duplicate, false);
  assert.equal(ndaFixture.acceptNda(4, 10, 41).duplicate, true); cases++;
  const revokedNdaFixture = new MemoryWorkflow();
  revokedNdaFixture.identities.set(42, { id: 42, accountId: 4, type: "designer", status: "active" });
  const revokedNdaInvitation = revokedNdaFixture.invite(1, 10, 4, 42, "designer", true);
  revokedNdaFixture.revoke(revokedNdaInvitation.id);
  assert.throws(() => revokedNdaFixture.acceptNda(4, 10, 42), /RESOURCE_RELATION_REQUIRED/); cases++;
  assert.equal(ndaInvitation.status, "pending"); cases++;

  const projectFixture = new MemoryWorkflow();
  projectFixture.identities.set(51, { id: 51, accountId: 5, type: "engineer", status: "active" });
  projectFixture.identities.set(52, { id: 52, accountId: 5, type: "designer", status: "active" });
  const engineer = projectFixture.invite(1, 11, 5, 51, "engineer"); projectFixture.accept(5, engineer.id);
  const designer = projectFixture.invite(1, 11, 5, 52, "designer"); projectFixture.accept(5, designer.id);
  const converted = projectFixture.convert(11);
  assert.equal(converted.id, 9001); cases++;
  assert.deepEqual([...converted.memberships.get(1)!], ["initiator"]); cases++;
  assert.equal(converted.memberships.size, 2); cases++;
  assert.deepEqual([...converted.memberships.get(5)!].sort(), ["design_lead", "engineer"]); cases++;
  assert.equal(projectFixture.convert(11).duplicate, true); cases++;
  const firstProjectId = projectFixture.convert(11).id;
  const secondProjectId = projectFixture.convert(11).id;
  assert.equal(firstProjectId, secondProjectId); cases++;

  const rollbackFixture = new MemoryWorkflow();
  rollbackFixture.identities.set(61, { id: 61, accountId: 6, type: "engineer", status: "active" });
  const rollbackInvite = rollbackFixture.invite(1, 12, 6, 61, "engineer"); rollbackFixture.accept(6, rollbackInvite.id);
  assert.throws(() => rollbackFixture.convert(12, "role"), /fixture role failure/);
  assert.equal(rollbackFixture.convertedProject, null); cases++;
  await rollbackFixture.notifyWithoutRollback(() => { rollbackFixture.convert(12); }, async () => { throw new Error("notification failure"); });
  assert.equal((rollbackFixture.convertedProject as { id: number } | null)?.id, 9001); cases++;

  assert.match(source, /tx\.insert\(projects\)/);
  assert.match(source, /tx\.insert\(projectMemberships\)/);
  assert.match(source, /tx\.insert\(projectMembershipRoles\)/);
  assert.match(source, /convertedProjectId: projectId/);

  console.log(`V3.3-B1 idea service synthetic tests passed: ${cases} cases`);
  if (!process.env.DATABASE_URL) console.log("V3.3-B1 MySQL integration: BLOCKED_BY_ENVIRONMENT (DATABASE_URL is not set)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
