import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  businessIdentities,
  certifications,
  certificationTypes,
  identityTypes,
  organizationMemberships,
  organizations,
  platformStaffPositions,
  userProfiles,
  workspacePreferences,
} from "../../drizzle/schema";
import { resourceIdDigest } from "../authorization/audit-writer";
import { DrizzlePermissionAuditWriter } from "../authorization/drizzle-audit-writer";
import { requireDb } from "../db";
import { compatibilityRoleForWorkspace, identityWorkspaceAvailability, normalizeRequestId, organizationWorkspaceAvailability } from "./identity-organization-domain";

export type WorkspaceTarget =
  | { workspaceType: "personal" }
  | { workspaceType: "identity"; identityId: number }
  | { workspaceType: "organization"; organizationId: number }
  | { workspaceType: "platform"; platformStaffPositionId: number };

const invalidCertificationStatuses = new Set(["revoked", "expired"]);

export async function listAvailableWorkspaces(accountId: number) {
  const db = await requireDb();
  const [identityRows, organizationRows, platformRows, preferenceRows] = await Promise.all([
    db.select({
      identityId: businessIdentities.id,
      typeCode: identityTypes.code,
      name: identityTypes.name,
      identityStatus: businessIdentities.status,
      requiresCertification: identityTypes.requiresCertification,
    }).from(businessIdentities).innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId))
      .where(and(eq(businessIdentities.accountId, accountId), isNull(identityTypes.deletedAt))),
    db.select({
      organizationId: organizations.id,
      name: organizations.name,
      organizationStatus: organizations.status,
      membershipId: organizationMemberships.id,
      membershipStatus: organizationMemberships.status,
    }).from(organizationMemberships).innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(organizationMemberships.accountId, accountId)),
    db.select({ id: platformStaffPositions.id, positionCode: platformStaffPositions.positionCode, status: platformStaffPositions.status, validFrom: platformStaffPositions.validFrom, validUntil: platformStaffPositions.validUntil })
      .from(platformStaffPositions).where(eq(platformStaffPositions.accountId, accountId)),
    db.select().from(workspacePreferences).where(eq(workspacePreferences.accountId, accountId)).limit(1),
  ]);

  const identities = await Promise.all(identityRows.map(async (identity) => {
    const latest = identity.requiresCertification ? (await db.select({ code: certificationTypes.code, status: certifications.status, expiresAt: certifications.expiresAt })
      .from(certifications).innerJoin(certificationTypes, eq(certificationTypes.id, certifications.certificationTypeId))
      .where(eq(certifications.subjectIdentityId, identity.identityId)).orderBy(desc(certifications.createdAt)).limit(1))[0] : undefined;
    const certificationStatus = latest?.status === "approved" && latest.expiresAt && latest.expiresAt.getTime() <= Date.now() ? "expired" : latest?.status ?? null;
    const unavailableReason = identity.identityStatus !== "active" ? "IDENTITY_INACTIVE"
      : certificationStatus && invalidCertificationStatuses.has(certificationStatus) ? "CERTIFICATION_INACTIVE" : null;
    return { workspaceType: "identity" as const, ...identity, certificationCode: latest?.code ?? null, certificationStatus, available: unavailableReason === null, unavailableReason };
  }));
  const organizationsAvailable = organizationRows.map((row) => ({
    workspaceType: "organization" as const,
    ...row,
    available: row.organizationStatus === "active" && row.membershipStatus === "active",
    unavailableReason: row.organizationStatus !== "active" ? "RESOURCE_STATE_FORBIDDEN" : row.membershipStatus !== "active" ? "ORGANIZATION_MEMBERSHIP_INACTIVE" : null,
  }));
  const now = Date.now();
  const platforms = platformRows.map((row) => ({
    workspaceType: "platform" as const,
    platformStaffPositionId: row.id,
    positionCode: row.positionCode,
    available: row.status === "active" && row.validFrom.getTime() <= now && (!row.validUntil || row.validUntil.getTime() > now),
    unavailableReason: row.status === "active" ? "STAFF_POSITION_INACTIVE" : "STAFF_POSITION_INACTIVE",
  }));
  return {
    current: preferenceRows[0] ?? { workspaceType: "personal" as const, identityId: null, organizationId: null, platformStaffPositionId: null, version: 0 },
    available: [{ workspaceType: "personal" as const, available: true, unavailableReason: null }, ...identities, ...organizationsAvailable, ...platforms],
  };
}

export async function switchWorkspace(accountId: number, target: WorkspaceTarget, requestIdValue?: string | null) {
  const db = await requireDb();
  const requestId = normalizeRequestId(requestIdValue);
  const validated = await db.transaction(async (tx) => {
    let identityId: number | null = null;
    let organizationId: number | null = null;
    let platformStaffPositionId: number | null = null;
    let identityTypeCode: string | null = null;

    if (target.workspaceType === "identity") {
      const [identity] = await tx.select({
        id: businessIdentities.id,
        accountId: businessIdentities.accountId,
        status: businessIdentities.status,
        typeCode: identityTypes.code,
        requiresCertification: identityTypes.requiresCertification,
      }).from(businessIdentities).innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId))
        .where(and(eq(businessIdentities.id, target.identityId), eq(businessIdentities.accountId, accountId), isNull(identityTypes.deletedAt))).for("update").limit(1);
      if (!identity || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
      if (identity.requiresCertification) {
        const [latest] = await tx.select({ status: certifications.status, expiresAt: certifications.expiresAt }).from(certifications)
          .where(eq(certifications.subjectIdentityId, identity.id)).orderBy(desc(certifications.createdAt)).limit(1);
        const effectiveStatus = latest?.status === "approved" && latest.expiresAt && latest.expiresAt.getTime() <= Date.now() ? "expired" : latest?.status;
        const availability = identityWorkspaceAvailability({ identity, accountId, certificationStatus: effectiveStatus });
        if (!availability.available) throw new Error(availability.reasonCode ?? "IDENTITY_INACTIVE");
      }
      identityId = identity.id;
      identityTypeCode = identity.typeCode;
    } else if (target.workspaceType === "organization") {
      const [membership] = await tx.select({
        status: organizationMemberships.status,
        organizationStatus: organizations.status,
      }).from(organizationMemberships).innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
        .where(and(eq(organizationMemberships.organizationId, target.organizationId), eq(organizationMemberships.accountId, accountId))).for("update").limit(1);
      const availability = organizationWorkspaceAvailability({ membership: membership ? { accountId, status: membership.status } : null, accountId, organizationStatus: membership?.organizationStatus });
      if (!availability.available) throw new Error(availability.reasonCode ?? "ORGANIZATION_MEMBERSHIP_INACTIVE");
      organizationId = target.organizationId;
    } else if (target.workspaceType === "platform") {
      const [position] = await tx.select().from(platformStaffPositions).where(and(eq(platformStaffPositions.id, target.platformStaffPositionId), eq(platformStaffPositions.accountId, accountId))).for("update").limit(1);
      const now = Date.now();
      if (!position || position.status !== "active" || position.validFrom.getTime() > now || (position.validUntil && position.validUntil.getTime() <= now)) throw new Error("STAFF_POSITION_INACTIVE");
      platformStaffPositionId = position.id;
    }

    await tx.insert(workspacePreferences).values({
      accountId, workspaceType: target.workspaceType, identityId, organizationId, platformStaffPositionId, lastUsedAt: new Date(),
    }).onDuplicateKeyUpdate({ set: {
      workspaceType: target.workspaceType, identityId, organizationId, platformStaffPositionId,
      lastUsedAt: new Date(), version: sql`${workspacePreferences.version} + 1`,
    } });

    const compatibilityRole = compatibilityRoleForWorkspace({ workspaceType: target.workspaceType, identityTypeCode });
    await tx.update(userProfiles).set({ currentRole: compatibilityRole }).where(eq(userProfiles.userId, accountId));
    const [preference] = await tx.select().from(workspacePreferences).where(eq(workspacePreferences.accountId, accountId)).limit(1);
    return { preference, activeIdentityId: identityId, compatibilityCurrentRole: compatibilityRole };
  });

  await new DrizzlePermissionAuditWriter().write({
    requestId,
    accountId,
    capabilityCode: "identity.switch",
    decision: "changed",
    reasonCode: "WORKSPACE_SWITCHED",
    resourceType: "workspace_preference",
    resourceIdDigest: resourceIdDigest("workspace_preference", String(accountId)),
    resolvedDataScope: "SELF",
    fieldMask: [],
    policyVersion: "v3.3-a5",
    resolvedIdentityId: validated.activeIdentityId,
    resolvedOrganizationId: validated.preference.organizationId,
    resolvedPlatformStaffPositionId: validated.preference.platformStaffPositionId,
    detail: { workspaceType: validated.preference.workspaceType, compatibilityMirrorUpdated: true },
  });
  return validated;
}
