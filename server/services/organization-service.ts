import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  organizationInvitations,
  organizationMemberPositions,
  organizationMemberships,
  organizationPositions,
  organizations,
  positionCapabilities,
  users,
} from "../../drizzle/schema";
import { resourceIdDigest } from "../authorization/audit-writer";
import { DrizzlePermissionAuditWriter } from "../authorization/drizzle-audit-writer";
import { requireDb } from "../db";
import {
  ORGANIZATION_OWNER_CAPABILITIES,
  normalizeRequestId,
  organizationInvitationDedupeKey,
  sha256,
} from "./identity-organization-domain";

const auditWriter = new DrizzlePermissionAuditWriter();

async function auditChange(input: {
  accountId: number;
  organizationId: number;
  capabilityCode: string;
  resourceType: string;
  resourceId: string | number;
  reasonCode: string;
  requestId: string;
}) {
  await auditWriter.write({
    requestId: input.requestId,
    accountId: input.accountId,
    capabilityCode: input.capabilityCode,
    decision: "changed",
    reasonCode: input.reasonCode,
    resourceType: input.resourceType,
    resourceIdDigest: resourceIdDigest(input.resourceType, String(input.resourceId)),
    resolvedDataScope: "ORGANIZATION",
    fieldMask: [],
    policyVersion: "v3.3-a4",
    resolvedOrganizationId: input.organizationId,
    detail: { actionRecorded: true },
  });
}

export async function listMyOrganizations(accountId: number) {
  const db = await requireDb();
  return db.select({
    id: organizations.id,
    name: organizations.name,
    organizationType: organizations.organizationType,
    description: organizations.description,
    cityCode: organizations.cityCode,
    cityName: organizations.cityName,
    status: organizations.status,
    version: organizations.version,
    membershipId: organizationMemberships.id,
    membershipStatus: organizationMemberships.status,
  }).from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.accountId, accountId));
}

export async function getOrganization(organizationId: number) {
  const db = await requireDb();
  return (await db.select({
    id: organizations.id,
    name: organizations.name,
    organizationType: organizations.organizationType,
    registrationCountry: organizations.registrationCountry,
    description: organizations.description,
    cityCode: organizations.cityCode,
    cityName: organizations.cityName,
    status: organizations.status,
    version: organizations.version,
    createdAt: organizations.createdAt,
    updatedAt: organizations.updatedAt,
  }).from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0] ?? null;
}

export async function createOrganization(accountId: number, input: {
  name: string;
  organizationType: string;
  registrationCountry?: string;
  description?: string;
  cityCode?: string;
  cityName?: string;
  requestId?: string | null;
}) {
  const db = await requireDb();
  const requestId = normalizeRequestId(input.requestId);
  const created = await db.transaction(async (tx) => {
    const orgResult = await tx.insert(organizations).values({
      name: input.name,
      organizationType: input.organizationType,
      registrationCountry: input.registrationCountry,
      creatorAccountId: accountId,
      description: input.description,
      cityCode: input.cityCode,
      cityName: input.cityName,
      status: "active",
    });
    const organizationId = Number(orgResult[0].insertId);
    const memberResult = await tx.insert(organizationMemberships).values({
      organizationId,
      accountId,
      status: "active",
      lastRequestId: requestId,
    });
    const membershipId = Number(memberResult[0].insertId);
    const positionResult = await tx.insert(organizationPositions).values({
      organizationId,
      code: "owner",
      name: "组织所有者",
      description: "组织创建时原子建立的系统所有者岗位",
      isOwnerPosition: true,
      isSystem: true,
      status: "active",
    });
    const positionId = Number(positionResult[0].insertId);
    await tx.insert(organizationMemberPositions).values({
      organizationId,
      membershipId,
      positionId,
      status: "active",
      assignedBy: accountId,
      lastRequestId: requestId,
    });
    await tx.insert(positionCapabilities).values(ORGANIZATION_OWNER_CAPABILITIES.map((capabilityCode) => ({
      organizationId,
      positionId,
      capabilityCode,
      dataScope: "ORGANIZATION" as const,
      status: "active" as const,
      grantedBy: accountId,
      lastRequestId: requestId,
    })));
    return { organizationId, membershipId, positionId, requestId };
  });
  await auditChange({ accountId, organizationId: created.organizationId, capabilityCode: "organization.create", resourceType: "organization", resourceId: created.organizationId, reasonCode: "ORGANIZATION_CREATED", requestId });
  return created;
}

export async function updateOrganization(accountId: number, organizationId: number, input: {
  name?: string;
  description?: string;
  cityCode?: string;
  cityName?: string;
  expectedVersion: number;
  requestId?: string | null;
}) {
  const db = await requireDb();
  const requestId = normalizeRequestId(input.requestId);
  const changed = await db.update(organizations).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.cityCode !== undefined ? { cityCode: input.cityCode } : {}),
    ...(input.cityName !== undefined ? { cityName: input.cityName } : {}),
    version: input.expectedVersion + 1,
  }).where(and(eq(organizations.id, organizationId), eq(organizations.version, input.expectedVersion), eq(organizations.status, "active")));
  if (Number(changed[0].affectedRows) !== 1) throw new Error("CONCURRENT_MODIFICATION");
  await auditChange({ accountId, organizationId, capabilityCode: "organization.update", resourceType: "organization", resourceId: organizationId, reasonCode: "ORGANIZATION_UPDATED", requestId });
  return { id: organizationId, version: input.expectedVersion + 1 };
}

export async function listOrganizationMembers(organizationId: number) {
  const db = await requireDb();
  const members = await db.select({
    id: organizationMemberships.id,
    accountId: organizationMemberships.accountId,
    accountName: users.name,
    status: organizationMemberships.status,
    joinedAt: organizationMemberships.joinedAt,
    version: organizationMemberships.version,
  }).from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.accountId))
    .where(eq(organizationMemberships.organizationId, organizationId));
  const membershipIds = members.map((row) => row.id);
  const assignments = membershipIds.length ? await db.select({
    membershipId: organizationMemberPositions.membershipId,
    assignmentId: organizationMemberPositions.id,
    assignmentStatus: organizationMemberPositions.status,
    positionId: organizationPositions.id,
    positionCode: organizationPositions.code,
    positionName: organizationPositions.name,
    isOwnerPosition: organizationPositions.isOwnerPosition,
  }).from(organizationMemberPositions)
    .innerJoin(organizationPositions, and(
      eq(organizationPositions.id, organizationMemberPositions.positionId),
      eq(organizationPositions.organizationId, organizationMemberPositions.organizationId),
    ))
    .where(and(eq(organizationMemberPositions.organizationId, organizationId), inArray(organizationMemberPositions.membershipId, membershipIds))) : [];
  return members.map((member) => ({ ...member, positions: assignments.filter((item) => item.membershipId === member.id) }));
}

export async function listOrganizationPositions(organizationId: number) {
  const db = await requireDb();
  return db.select().from(organizationPositions).where(and(eq(organizationPositions.organizationId, organizationId), eq(organizationPositions.status, "active")));
}

export async function createOrganizationPosition(accountId: number, organizationId: number, input: {
  code: string;
  name: string;
  description?: string;
  capabilityCodes: string[];
  requestId?: string | null;
}) {
  if (input.code === "owner") throw new Error("RESOURCE_STATE_FORBIDDEN");
  const db = await requireDb();
  const requestId = normalizeRequestId(input.requestId);
  const result = await db.transaction(async (tx) => {
    const inserted = await tx.insert(organizationPositions).values({
      organizationId, code: input.code, name: input.name, description: input.description,
      isOwnerPosition: false, isSystem: false, status: "active",
    });
    const positionId = Number(inserted[0].insertId);
    if (input.capabilityCodes.length) await tx.insert(positionCapabilities).values([...new Set(input.capabilityCodes)].map((capabilityCode) => ({
      organizationId, positionId, capabilityCode, dataScope: "ORGANIZATION" as const,
      status: "active" as const, grantedBy: accountId, lastRequestId: requestId,
    })));
    return { positionId };
  });
  await auditChange({ accountId, organizationId, capabilityCode: "organization.position.manage", resourceType: "organization_position", resourceId: result.positionId, reasonCode: "POSITION_CREATED", requestId });
  return result;
}

export async function inviteOrganizationMember(accountId: number, organizationId: number, inviteeAccountId: number, expiresInHours: number, requestIdValue?: string | null) {
  if (accountId === inviteeAccountId) throw new Error("RESOURCE_STATE_FORBIDDEN");
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenDigest = sha256(rawToken);
  const activeDedupeKey = organizationInvitationDedupeKey(organizationId, inviteeAccountId);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const result = await db.transaction(async (tx) => {
    const [membership] = await tx.select().from(organizationMemberships).where(and(
      eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.accountId, accountId),
    )).limit(1);
    if (!membership || membership.status !== "active") throw new Error("ORGANIZATION_MEMBERSHIP_INACTIVE");
    await tx.insert(organizationInvitations).values({
      organizationId, inviterMembershipId: membership.id, inviteeAccountId, tokenDigest,
      status: "pending", activeDedupeKey, expiresAt, requestId,
    }).onDuplicateKeyUpdate({ set: { updatedAt: sql`${organizationInvitations.updatedAt}` } });
    const [invitation] = await tx.select().from(organizationInvitations).where(eq(organizationInvitations.activeDedupeKey, activeDedupeKey)).limit(1);
    if (!invitation) throw new Error("CONCURRENT_MODIFICATION");
    return { invitation, created: invitation.tokenDigest === tokenDigest };
  });
  await auditChange({ accountId, organizationId, capabilityCode: "organization.member.invite", resourceType: "organization_invitation", resourceId: result.invitation.id, reasonCode: "INVITATION_CREATED", requestId });
  return { id: result.invitation.id, status: result.invitation.status, expiresAt: result.invitation.expiresAt, token: result.created ? rawToken : null, created: result.created };
}

export async function respondToOrganizationInvitation(accountId: number, rawToken: string, action: "accept" | "decline", requestIdValue?: string | null) {
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const tokenDigest = sha256(rawToken);
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx.select().from(organizationInvitations).where(eq(organizationInvitations.tokenDigest, tokenDigest)).for("update").limit(1);
    if (!invitation || invitation.inviteeAccountId !== accountId) return { error: "INVITATION_INVALID" as const };
    if (invitation.status === "accepted" && action === "accept") {
      const [membership] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, invitation.organizationId), eq(organizationMemberships.accountId, accountId))).limit(1);
      return { invitation, membership, idempotent: true };
    }
    if (invitation.status !== "pending") return { error: "INVITATION_INVALID" as const };
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await tx.update(organizationInvitations).set({ status: "expired", activeDedupeKey: null, version: invitation.version + 1 }).where(eq(organizationInvitations.id, invitation.id));
      return { error: "INVITATION_EXPIRED" as const };
    }
    if (action === "decline") {
      await tx.update(organizationInvitations).set({ status: "declined", activeDedupeKey: null, version: invitation.version + 1 }).where(eq(organizationInvitations.id, invitation.id));
      return { invitation: { ...invitation, status: "declined" as const }, membership: null, idempotent: false };
    }
    let [membership] = await tx.select().from(organizationMemberships).where(and(
      eq(organizationMemberships.organizationId, invitation.organizationId), eq(organizationMemberships.accountId, accountId),
    )).for("update").limit(1);
    if (membership?.status === "suspended") return { error: "ORGANIZATION_MEMBERSHIP_INACTIVE" as const };
    if (membership && ["left", "removed"].includes(membership.status)) {
      await tx.update(organizationMemberships).set({
        status: "active", sourceInvitationId: invitation.id, joinedAt: new Date(), suspendedAt: null,
        leftAt: null, removedAt: null, endedBy: null, endReason: null, lastRequestId: requestId, version: membership.version + 1,
      }).where(eq(organizationMemberships.id, membership.id));
      membership = { ...membership, status: "active", sourceInvitationId: invitation.id, lastRequestId: requestId, version: membership.version + 1 };
    } else if (!membership) {
      const inserted = await tx.insert(organizationMemberships).values({
        organizationId: invitation.organizationId, accountId, status: "active", sourceInvitationId: invitation.id, lastRequestId: requestId,
      });
      [membership] = await tx.select().from(organizationMemberships).where(eq(organizationMemberships.id, Number(inserted[0].insertId))).limit(1);
    }
    await tx.update(organizationInvitations).set({
      status: "accepted", activeDedupeKey: null, acceptedByAccountId: accountId, acceptedAt: new Date(), version: invitation.version + 1,
    }).where(eq(organizationInvitations.id, invitation.id));
    return { invitation: { ...invitation, status: "accepted" as const }, membership, idempotent: false };
  });
  if ("error" in result) throw new Error(result.error);
  await auditChange({ accountId, organizationId: result.invitation.organizationId, capabilityCode: "organization.invitation.accept", resourceType: "organization_invitation", resourceId: result.invitation.id, reasonCode: action === "accept" ? "INVITATION_ACCEPTED" : "INVITATION_DECLINED", requestId });
  return result;
}

async function isLastActiveOwner(organizationId: number, membershipId: number): Promise<boolean> {
  const db = await requireDb();
  const owners = await db.select({ membershipId: organizationMemberPositions.membershipId }).from(organizationMemberPositions)
    .innerJoin(organizationMemberships, and(eq(organizationMemberships.id, organizationMemberPositions.membershipId), eq(organizationMemberships.organizationId, organizationMemberPositions.organizationId)))
    .innerJoin(organizationPositions, and(eq(organizationPositions.id, organizationMemberPositions.positionId), eq(organizationPositions.organizationId, organizationMemberPositions.organizationId)))
    .where(and(
      eq(organizationMemberPositions.organizationId, organizationId), eq(organizationMemberPositions.status, "active"),
      eq(organizationMemberships.status, "active"), eq(organizationPositions.isOwnerPosition, true), eq(organizationPositions.status, "active"),
    ));
  return owners.length === 1 && owners[0].membershipId === membershipId;
}

export async function changeOrganizationMemberStatus(actorId: number, organizationId: number, membershipId: number, action: "suspend" | "restore" | "remove" | "leave", reason: string | undefined, requestIdValue?: string | null) {
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const [target] = await db.select().from(organizationMemberships).where(and(eq(organizationMemberships.id, membershipId), eq(organizationMemberships.organizationId, organizationId))).limit(1);
  if (!target) throw new Error("ORGANIZATION_MEMBERSHIP_INACTIVE");
  if (action === "leave" && target.accountId !== actorId) throw new Error("DATA_SCOPE_MISMATCH");
  if (["suspend", "remove", "leave"].includes(action) && await isLastActiveOwner(organizationId, membershipId)) throw new Error("LAST_OWNER_CANNOT_LEAVE");
  const allowed = action === "restore" ? target.status === "suspended" : target.status === "active";
  if (!allowed) throw new Error("RESOURCE_STATE_FORBIDDEN");
  const next = action === "restore" ? "active" : action === "suspend" ? "suspended" : action === "remove" ? "removed" : "left";
  const now = new Date();
  const changed = await db.update(organizationMemberships).set({
    status: next,
    suspendedAt: next === "suspended" ? now : null,
    leftAt: next === "left" ? now : null,
    removedAt: next === "removed" ? now : null,
    endedBy: next === "active" ? null : actorId,
    endReason: next === "active" ? null : reason?.slice(0, 500) || action,
    lastRequestId: requestId,
    version: target.version + 1,
  }).where(and(eq(organizationMemberships.id, membershipId), eq(organizationMemberships.version, target.version)));
  if (Number(changed[0].affectedRows) !== 1) throw new Error("CONCURRENT_MODIFICATION");
  const capabilityCode = action === "leave" ? "organization.member.leave" : action === "restore" ? "organization.member.restore" : action === "suspend" ? "organization.member.suspend" : "organization.member.remove";
  await auditChange({ accountId: actorId, organizationId, capabilityCode, resourceType: "organization_membership", resourceId: membershipId, reasonCode: `MEMBERSHIP_${next.toUpperCase()}`, requestId });
  return { id: membershipId, status: next, version: target.version + 1 };
}

export async function assignOrganizationPosition(actorId: number, organizationId: number, membershipId: number, positionId: number, requestIdValue?: string | null) {
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const result = await db.transaction(async (tx) => {
    const [membership] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.id, membershipId), eq(organizationMemberships.organizationId, organizationId))).for("update").limit(1);
    const [position] = await tx.select().from(organizationPositions).where(and(eq(organizationPositions.id, positionId), eq(organizationPositions.organizationId, organizationId))).limit(1);
    if (!membership || membership.status !== "active" || !position || position.status !== "active") throw new Error("DATA_SCOPE_MISMATCH");
    const [existing] = await tx.select().from(organizationMemberPositions).where(and(eq(organizationMemberPositions.membershipId, membershipId), eq(organizationMemberPositions.positionId, positionId))).for("update").limit(1);
    if (existing) {
      if (existing.status === "active") return { id: existing.id, status: existing.status, reused: true };
      await tx.update(organizationMemberPositions).set({ status: "active", assignedBy: actorId, assignedAt: new Date(), revokedBy: null, revokedAt: null, reason: null, lastRequestId: requestId, version: existing.version + 1 }).where(eq(organizationMemberPositions.id, existing.id));
      return { id: existing.id, status: "active" as const, reused: true };
    }
    const inserted = await tx.insert(organizationMemberPositions).values({ organizationId, membershipId, positionId, status: "active", assignedBy: actorId, lastRequestId: requestId });
    return { id: Number(inserted[0].insertId), status: "active" as const, reused: false };
  });
  await auditChange({ accountId: actorId, organizationId, capabilityCode: "organization.member.assign_position", resourceType: "organization_member_position", resourceId: result.id, reasonCode: "POSITION_ASSIGNED", requestId });
  return result;
}

export async function revokeOrganizationPosition(actorId: number, organizationId: number, assignmentId: number, reason: string | undefined, requestIdValue?: string | null) {
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const [assignment] = await db.select({
    id: organizationMemberPositions.id,
    membershipId: organizationMemberPositions.membershipId,
    status: organizationMemberPositions.status,
    version: organizationMemberPositions.version,
    isOwnerPosition: organizationPositions.isOwnerPosition,
  }).from(organizationMemberPositions).innerJoin(organizationPositions, and(eq(organizationPositions.id, organizationMemberPositions.positionId), eq(organizationPositions.organizationId, organizationMemberPositions.organizationId)))
    .where(and(eq(organizationMemberPositions.id, assignmentId), eq(organizationMemberPositions.organizationId, organizationId))).limit(1);
  if (!assignment || assignment.status !== "active") throw new Error("RESOURCE_STATE_FORBIDDEN");
  if (assignment.isOwnerPosition && await isLastActiveOwner(organizationId, assignment.membershipId)) throw new Error("LAST_OWNER_CANNOT_LEAVE");
  const changed = await db.update(organizationMemberPositions).set({ status: "revoked", revokedBy: actorId, revokedAt: new Date(), reason: reason?.slice(0, 500), lastRequestId: requestId, version: assignment.version + 1 })
    .where(and(eq(organizationMemberPositions.id, assignmentId), eq(organizationMemberPositions.version, assignment.version)));
  if (Number(changed[0].affectedRows) !== 1) throw new Error("CONCURRENT_MODIFICATION");
  await auditChange({ accountId: actorId, organizationId, capabilityCode: "organization.member.assign_position", resourceType: "organization_member_position", resourceId: assignmentId, reasonCode: "POSITION_REVOKED", requestId });
  return { id: assignmentId, status: "revoked" as const };
}
