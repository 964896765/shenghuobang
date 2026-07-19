import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  businessIdentities,
  capabilities,
  capabilityGrants,
  certificationReviewActions,
  certifications,
  certificationTypes,
  complaintStatusLogs,
  complaints,
  conversations,
  engineerVerifications,
  identityTypes,
  identityVerifications,
  merchantVerifications,
  milestones,
  needs,
  organizationMemberPositions,
  organizationInvitations,
  organizationMemberships,
  organizations,
  permissionAuditEvents,
  platformStaffPositions,
  positionCapabilities,
  projectChanges,
  projectFiles,
  projectMembershipRoles,
  projectMemberships,
  projectRoleCapabilities,
  projects,
  quotes,
  refunds,
  settlements,
  storedFiles,
  userProfiles,
  users,
  verificationActions,
  workspacePreferences,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import { capabilitiesForPlatformPosition } from "./capability-resolver";
import type {
  AuthorizationDataSource,
  AuthorizationFacts,
  AuthorizationRequest,
  CapabilityAssignment,
  Confidentiality,
  DataScope,
  ResourceFact,
} from "./types";

type Db = Awaited<ReturnType<typeof requireDb>>;

const RESOURCE_FIELDS: Record<string, string[]> = {
  identity: ["id", "typeCode", "status", "displayName", "professionalTitle", "introduction", "skills", "cityName", "profileData"],
  certification: ["id", "applicationNo", "certificationTypeId", "subjectIdentityId", "subjectOrganizationId", "status", "applicationData", "submittedAt", "approvedAt", "expiresAt", "revokedAt", "decisionReasonCode", "decisionReason"],
  organization: ["id", "name", "organizationType", "registrationCountry", "description", "cityCode", "cityName", "status", "version"],
  organization_invitation: ["id", "organizationId", "inviteeAccountId", "status", "expiresAt", "createdAt"],
  project: ["id", "title", "status", "ownerId", "engineerId", "totalAmount"],
  project_file: ["id", "projectId", "fileName", "storageKey", "publicUrl", "mimeType", "sizeBytes", "status"],
  quote: ["id", "needId", "engineerId", "totalPrice", "deliverables", "exclusions", "paymentTerms", "status"],
  "verification:identity": ["id", "realName", "idType", "idNumberDigest", "idNumberLast4", "provider", "status", "rejectReason"],
  "verification:engineer": ["id", "realName", "professionalTitle", "primaryCategory", "yearsOfExperience", "introduction", "skills", "status", "rejectReason"],
  "verification:merchant": ["id", "merchantName", "registrationNoDigest", "registrationNoLast4", "categories", "description", "addressText", "status", "rejectReason"],
  complaint: ["id", "description", "expectedResolution", "respondentStatement", "resolution", "status"],
  refund: ["id", "refundNo", "amount", "reason", "reviewReason", "failedReason", "status"],
  settlement: ["id", "settlementNo", "amount", "frozenReason", "status"],
  stored_file: ["id", "originalName", "storageKey", "mimeType", "sizeBytes", "status"],
  audit_event: ["id", "resourceType", "reasonCode", "contextData", "ipAddress", "userAgent"],
};

const ACCOUNT_SELF_CAPABILITIES = new Set([
  "account.profile.update_self",
  "identity.list_self",
  "identity.create",
  "identity.profile.update_self",
  "identity.suspend",
  "identity.switch",
  "certification.submit_self",
  "certification.view_self",
  "organization.create",
  "organization.invitation.accept",
  "organization.member.leave",
]);

const ENGINEER_CERTIFICATION_CAPABILITIES = new Set(["quote.submit", "project.milestone.submit"]);
const LEGACY_OWNER_CAPABILITIES = new Set([
  "project.view", "project.requirement.edit", "project.file.upload", "project.file.download", "project.file.disable",
  "project.milestone.accept", "project.milestone.request_revision", "project.change.propose", "project.change.approve",
]);
const LEGACY_ENGINEER_CAPABILITIES = new Set([
  "project.view", "project.requirement.edit", "project.file.upload", "project.file.download", "project.file.disable",
  "project.milestone.submit", "project.change.propose",
]);
export const PROJECT_ROLE_FROZEN_CAPABILITIES: Readonly<Record<string, ReadonlySet<string>>> = {
  initiator: new Set([...LEGACY_OWNER_CAPABILITIES, "message.start", "message.read", "message.send"]),
  project_lead: new Set([...LEGACY_OWNER_CAPABILITIES, "message.start", "message.read", "message.send"]),
  engineer: new Set([...LEGACY_ENGINEER_CAPABILITIES, "message.start", "message.read", "message.send"]),
  design_lead: new Set(["project.view", "project.file.upload", "project.file.download", "project.change.propose", "message.start", "message.read", "message.send"]),
  supplier: new Set(["project.view", "project.file.upload", "project.file.download", "message.start", "message.read", "message.send"]),
  manufacturer: new Set(["project.view", "project.file.upload", "project.file.download", "message.start", "message.read", "message.send"]),
  inspector: new Set(["project.view", "project.file.download", "project.milestone.request_revision", "message.read"]),
  reviewer: new Set(["project.view", "project.file.download", "project.milestone.accept", "project.milestone.request_revision", "message.read"]),
  viewer: new Set(["project.view", "project.file.download", "message.read"]),
};

export interface ProjectRoleMembershipRef { id: number; scopeId: number }
export interface ExplicitProjectRoleCapabilityFact {
  roleCode: string;
  capabilityCode?: string;
  assignmentStatus: string;
  capabilityStatus: string;
  dataScope: string;
}
export interface ProjectMembershipRoleFact { roleCode: string; status: string }

/** Explicit facts, including non-active facts, always suppress the frozen compatibility baseline. */
export function resolveProjectRoleCapabilityAssignments(input: {
  membership: ProjectRoleMembershipRef | null;
  capabilityCode: string;
  explicitFacts: ExplicitProjectRoleCapabilityFact[];
  membershipRoles: ProjectMembershipRoleFact[];
}): { assignments: CapabilityAssignment[]; compatibilityMarkers: string[] } {
  if (!input.membership) return { assignments: [], compatibilityMarkers: [] };
  const explicitForCurrentCapability = input.explicitFacts.filter((fact) => fact.capabilityCode == null || fact.capabilityCode === input.capabilityCode);
  if (explicitForCurrentCapability.length > 0) {
    return {
      assignments: explicitForCurrentCapability.map((fact) => ({
        capabilityCode: input.capabilityCode,
        sourceType: "PROJECT_ROLE" as const,
        subjectId: input.membership!.id,
        projectId: input.membership!.scopeId,
        status: fact.assignmentStatus === "active" && fact.capabilityStatus === "active" ? "active" as const : "revoked" as const,
        dataScope: asScope(fact.dataScope),
      })),
      compatibilityMarkers: [],
    };
  }
  const eligibleRoles = input.membershipRoles.filter((role) => role.status === "active" && PROJECT_ROLE_FROZEN_CAPABILITIES[role.roleCode]?.has(input.capabilityCode));
  return {
    assignments: eligibleRoles.map(() => ({
      capabilityCode: input.capabilityCode,
      sourceType: "PROJECT_ROLE" as const,
      subjectId: input.membership!.id,
      projectId: input.membership!.scopeId,
      status: "active" as const,
      dataScope: "PROJECT" as const,
    })),
    compatibilityMarkers: eligibleRoles.map((role) => `compat:project-role-frozen:${role.roleCode}:${input.capabilityCode}`),
  };
}

export function resourceFieldsFor(resourceType: string): string[] {
  return [...(RESOURCE_FIELDS[resourceType] ?? [])];
}

export function isFileUploadInitializationRequest(request: AuthorizationRequest, resource: ResourceFact | null): boolean {
  return request.capabilityCode === "file.access" &&
    request.purpose === "upload_file" &&
    !request.resourceType && request.resourceId == null && resource === null;
}

export function resolveQuoteSelfAssignment(request: AuthorizationRequest, resource: ResourceFact | null): CapabilityAssignment | null {
  if (resource?.resourceType !== "quote") return null;
  const common = { capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF" as const, subjectId: request.accountId, status: "active" as const, allowedFields: ["supplier_quote:FULL"] };
  if (request.capabilityCode === "quote.view" && resource.memberAccountIds?.includes(request.accountId)) return { ...common, dataScope: "INVITED_RESOURCE" };
  if (request.capabilityCode === "quote.submit" && resource.assigneeAccountId === request.accountId) return { ...common, dataScope: "ASSIGNED_RESOURCE" };
  if (["quote.accept", "quote.reject"].includes(request.capabilityCode) && resource.ownerAccountId === request.accountId) return { ...common, dataScope: "OWNED_RESOURCE" };
  return null;
}

function statusAt(status: string, validUntil: Date | null, validFrom?: Date | null): "active" | "suspended" | "revoked" | "expired" {
  if (validFrom && validFrom.getTime() > Date.now()) return "suspended";
  if (validUntil && validUntil.getTime() <= Date.now()) return "expired";
  return status as "active" | "suspended" | "revoked" | "expired";
}

function asScope(value: string): DataScope {
  return value as DataScope;
}

function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function assignedScopeMatches(scope: Record<string, unknown> | null, resourceType?: string | null, resourceId?: string | null): "all" | "match" | "none" {
  if (!scope) return "none";
  if (scope.all === true) return "all";
  // A2.3 legacy imports create a real, minimal platform position and retain the source role only as provenance.
  if (typeof scope.sourceRole === "string") return "all";
  if (!resourceType) return "none";
  const pluralKey = `${resourceType}Ids`;
  const ids = scope[pluralKey] ?? scope.resourceIds;
  if (Array.isArray(ids) && resourceId && ids.map(String).includes(resourceId)) return "match";
  const types = scope.resourceTypes;
  if (types && typeof types === "object") {
    const configured = (types as Record<string, unknown>)[resourceType];
    if (configured === true) return resourceId ? "match" : "all";
    if (Array.isArray(configured) && resourceId && configured.map(String).includes(resourceId)) return "match";
  }
  return "none";
}

function confidentiality(value?: string | null): Confidentiality {
  return (["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"] as const).includes(value as Confidentiality)
    ? value as Confidentiality
    : "INTERNAL";
}

function allowedStatuses(capabilityCode: string, current: string): string[] {
  if (capabilityCode === "file.access" || capabilityCode === "project.file.download") return ["available"];
  if (capabilityCode.endsWith(".view") || capabilityCode.endsWith(".read") || capabilityCode.endsWith(".download")) return [current];
  if (capabilityCode === "project.requirement.edit") return ["pending_confirmation", "pending_agreement", "in_progress", "revision"];
  if (capabilityCode === "project.file.upload") return ["pending_confirmation", "pending_agreement", "pending_payment", "in_progress", "waiting_acceptance", "revision", "paused"];
  if (capabilityCode === "project.file.disable") return ["available"];
  if (capabilityCode === "project.milestone.submit") return ["in_progress", "revision_required"];
  if (capabilityCode === "project.milestone.accept" || capabilityCode === "project.milestone.request_revision") return ["submitted", "waiting_acceptance"];
  if (capabilityCode === "project.change.propose") return ["in_progress", "waiting_acceptance", "revision", "paused", "pending_confirmation"];
  if (capabilityCode === "project.change.approve") return ["pending_confirmation"];
  if (capabilityCode === "quote.submit") return ["published", "collecting_solutions", "selecting_quote", "submitted", "viewed", "negotiating"];
  if (capabilityCode === "quote.accept" || capabilityCode === "quote.reject") return ["submitted", "viewed", "negotiating"];
  if (capabilityCode === "platform.certification.review_initial" || capabilityCode === "platform.certification.review_final") return ["submitted", "under_review", "additional_info_required", "pending"];
  if (capabilityCode === "platform.certification.revoke") return ["approved"];
  if (capabilityCode === "platform.complaint.investigate") return ["submitted", "waiting_response", "under_review", "waiting_evidence", "negotiating", "decision_pending", "resolved", "rejected"];
  if (capabilityCode === "platform.complaint.decide") return ["under_review", "waiting_evidence", "negotiating", "decision_pending"];
  if (capabilityCode === "platform.finance.review") return ["submitted", "under_review", "pending"];
  if (capabilityCode.endsWith(".execute")) return ["approved", "failed"];
  if (capabilityCode.endsWith(".release")) return ["approved"];
  return [current];
}

export class DrizzleAuthorizationDataSource implements AuthorizationDataSource {
  constructor(private readonly getDatabase: () => Promise<Db> = requireDb) {}

  async resolve(request: AuthorizationRequest): Promise<AuthorizationFacts> {
    const db = await this.getDatabase();
    const [accountRow] = await db.select({
      id: users.id,
      status: users.accountStatus,
      legacyRole: users.role,
      currentRole: userProfiles.currentRole,
    }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(eq(users.id, request.accountId)).limit(1);
    const [workspacePreference] = await db.select({
      workspaceType: workspacePreferences.workspaceType,
      identityId: workspacePreferences.identityId,
      organizationId: workspacePreferences.organizationId,
      platformStaffPositionId: workspacePreferences.platformStaffPositionId,
    }).from(workspacePreferences)
      .where(eq(workspacePreferences.accountId, request.accountId)).limit(1);

    const [capabilityRow] = await db.select({
      code: capabilities.code,
      status: capabilities.status,
      riskLevel: capabilities.riskLevel,
    }).from(capabilities).where(and(eq(capabilities.code, request.capabilityCode), isNull(capabilities.deletedAt))).limit(1);

    const requiredCertificationCodes = ENGINEER_CERTIFICATION_CAPABILITIES.has(request.capabilityCode) ? ["engineer_basic"] : [];
    let identityId = request.identityId ?? (workspacePreference?.workspaceType === "identity" ? workspacePreference.identityId : null);
    if (identityId == null && requiredCertificationCodes.length && !workspacePreference) {
      // Compatibility applies only to accounts that have not yet received an A2.3 workspace preference.
      const [engineerIdentity] = await db.select({ id: businessIdentities.id }).from(businessIdentities)
        .innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId))
        .where(and(eq(businessIdentities.accountId, request.accountId), eq(businessIdentities.status, "active"), eq(identityTypes.code, "engineer"), isNull(identityTypes.deletedAt)))
        .limit(1);
      identityId = engineerIdentity?.id ?? null;
    }
    const [identityRow] = identityId == null ? [] : await db.select({ id: businessIdentities.id, accountId: businessIdentities.accountId, status: businessIdentities.status })
      .from(businessIdentities).where(and(eq(businessIdentities.id, identityId), eq(businessIdentities.accountId, request.accountId))).limit(1);
    const certificationRows = identityRow ? await db.select({ identityId: certifications.subjectIdentityId, code: certificationTypes.code, status: certifications.status, expiresAt: certifications.expiresAt })
      .from(certifications).innerJoin(certificationTypes, eq(certificationTypes.id, certifications.certificationTypeId))
      .where(and(eq(certifications.subjectIdentityId, identityRow.id), isNull(certificationTypes.deletedAt))) : [];

    const [organizationMembershipRow] = request.organizationId == null ? [] : await db.select({ id: organizationMemberships.id, accountId: organizationMemberships.accountId, scopeId: organizationMemberships.organizationId, status: organizationMemberships.status })
      .from(organizationMemberships).where(and(eq(organizationMemberships.accountId, request.accountId), eq(organizationMemberships.organizationId, request.organizationId))).limit(1);
    let [projectMembershipRow] = request.projectId == null ? [] : await db.select({
      id: projectMemberships.id,
      accountId: projectMemberships.accountId,
      scopeId: projectMemberships.projectId,
      status: projectMemberships.status,
      clearance: projectMemberships.confidentialityClearance,
    }).from(projectMemberships).where(and(eq(projectMemberships.accountId, request.accountId), eq(projectMemberships.projectId, request.projectId))).limit(1);

    const resource = await this.resolveResource(db, request);
    const assignments: CapabilityAssignment[] = [];
    const legacyPermissions: string[] = [];

    if (organizationMembershipRow) {
      const rows = await db.select({
        positionId: organizationMemberPositions.positionId,
        assignmentStatus: organizationMemberPositions.status,
        capabilityStatus: positionCapabilities.status,
        dataScope: positionCapabilities.dataScope,
      }).from(organizationMemberPositions)
        .innerJoin(positionCapabilities, and(eq(positionCapabilities.positionId, organizationMemberPositions.positionId), eq(positionCapabilities.organizationId, organizationMemberPositions.organizationId)))
        .where(and(
          eq(organizationMemberPositions.membershipId, organizationMembershipRow.id),
          eq(organizationMemberPositions.organizationId, organizationMembershipRow.scopeId),
          eq(positionCapabilities.capabilityCode, request.capabilityCode),
        ));
      rows.forEach((row) => assignments.push({
        capabilityCode: request.capabilityCode,
        sourceType: "ORGANIZATION_POSITION",
        subjectId: organizationMembershipRow.id,
        organizationId: organizationMembershipRow.scopeId,
        status: row.assignmentStatus === "active" && row.capabilityStatus === "active" ? "active" : "revoked",
        dataScope: asScope(row.dataScope),
      }));
    }

    if (projectMembershipRow) {
      const explicitFacts = await db.select({
        roleCode: projectMembershipRoles.roleCode,
        assignmentStatus: projectMembershipRoles.status,
        capabilityStatus: projectRoleCapabilities.status,
        dataScope: projectRoleCapabilities.dataScope,
      }).from(projectMembershipRoles)
        .innerJoin(projectRoleCapabilities, eq(projectRoleCapabilities.roleCode, projectMembershipRoles.roleCode))
        .where(and(
          eq(projectMembershipRoles.projectMembershipId, projectMembershipRow.id),
          eq(projectMembershipRoles.projectId, projectMembershipRow.scopeId),
          eq(projectRoleCapabilities.capabilityCode, request.capabilityCode),
        ));
      const membershipRoles = explicitFacts.length > 0 ? [] : await db.select({ roleCode: projectMembershipRoles.roleCode, status: projectMembershipRoles.status })
        .from(projectMembershipRoles)
        .where(and(eq(projectMembershipRoles.projectMembershipId, projectMembershipRow.id), eq(projectMembershipRoles.projectId, projectMembershipRow.scopeId)));
      const resolvedProjectRoles = resolveProjectRoleCapabilityAssignments({
        membership: projectMembershipRow,
        capabilityCode: request.capabilityCode,
        explicitFacts,
        membershipRoles,
      });
      assignments.push(...resolvedProjectRoles.assignments);
      legacyPermissions.push(...resolvedProjectRoles.compatibilityMarkers);
    }

    const staffRows = await db.select({
      id: platformStaffPositions.id,
      accountId: platformStaffPositions.accountId,
      positionCode: platformStaffPositions.positionCode,
      status: platformStaffPositions.status,
      assignedCaseScope: platformStaffPositions.assignedCaseScope,
      validFrom: platformStaffPositions.validFrom,
      validUntil: platformStaffPositions.validUntil,
    }).from(platformStaffPositions).where(and(
      eq(platformStaffPositions.accountId, request.accountId),
      request.platformStaffPositionId == null ? undefined : eq(platformStaffPositions.id, request.platformStaffPositionId),
    ));
    for (const row of staffRows) {
      if (!capabilitiesForPlatformPosition(row.positionCode).includes(request.capabilityCode)) continue;
      const match = !request.resourceType && !request.resourceId && row.assignedCaseScope ? "match" : assignedScopeMatches(row.assignedCaseScope, request.resourceType, request.resourceId);
      const scope: DataScope = match === "all" ? "PLATFORM_ALL" : "PLATFORM_ASSIGNED";
      assignments.push({
        capabilityCode: request.capabilityCode,
        sourceType: "PLATFORM_POSITION",
        subjectId: request.accountId,
        platformStaffPositionId: row.id,
        status: match === "none" ? "suspended" : statusAt(row.status, row.validUntil, row.validFrom),
        dataScope: scope,
        resourceType: match === "match" ? request.resourceType ?? undefined : undefined,
        resourceId: match === "match" ? request.resourceId ?? undefined : undefined,
        allowedFields: row.positionCode === "security_auditor" ? []
          : row.positionCode.startsWith("certification_") ? ["identity_document:FULL", "business_registration:FULL"]
          : row.positionCode.startsWith("finance_") || row.positionCode === "funds_executor" ? ["settlement:FULL"]
          : ["phone:FULL", "email:FULL"],
      });
    }

    const grants = await db.select().from(capabilityGrants).where(and(
      eq(capabilityGrants.capabilityCode, request.capabilityCode),
      or(
        eq(capabilityGrants.accountId, request.accountId),
        identityRow ? eq(capabilityGrants.businessIdentityId, identityRow.id) : undefined,
        organizationMembershipRow ? eq(capabilityGrants.organizationMembershipId, organizationMembershipRow.id) : undefined,
        projectMembershipRow ? eq(capabilityGrants.projectMembershipId, projectMembershipRow.id) : undefined,
        request.platformStaffPositionId != null ? eq(capabilityGrants.platformStaffPositionId, request.platformStaffPositionId) : undefined,
      ),
    ));
    grants.forEach((row) => {
      const resourceMatches = (!row.resourceType || row.resourceType === request.resourceType) && (!row.resourceId || row.resourceId === request.resourceId);
      assignments.push({
        capabilityCode: request.capabilityCode,
        sourceType: "GRANT",
        subjectId: row.accountId ?? row.businessIdentityId ?? row.organizationMembershipId ?? row.projectMembershipId ?? row.platformStaffPositionId ?? 0,
        status: resourceMatches ? statusAt(row.status, row.validUntil, row.validFrom) : "suspended",
        dataScope: asScope(row.dataScope),
        resourceType: row.resourceType ?? undefined,
        resourceId: row.resourceId ?? undefined,
      });
    });

    if (request.projectId != null && !projectMembershipRow) {
      const [project] = await db.select({ ownerId: projects.ownerId, engineerId: projects.engineerId }).from(projects).where(eq(projects.id, request.projectId)).limit(1);
      const ownerMatch = project?.ownerId === request.accountId && LEGACY_OWNER_CAPABILITIES.has(request.capabilityCode);
      const engineerMatch = project?.engineerId === request.accountId && LEGACY_ENGINEER_CAPABILITIES.has(request.capabilityCode);
      if (ownerMatch || engineerMatch) {
        projectMembershipRow = { id: -request.accountId, accountId: request.accountId, scopeId: request.projectId, status: "active", clearance: "INTERNAL" };
        assignments.push({ capabilityCode: request.capabilityCode, sourceType: "PROJECT_ROLE", subjectId: projectMembershipRow.id, projectId: request.projectId, status: "active", dataScope: "PROJECT" });
        legacyPermissions.push(`compat:project:${ownerMatch ? "owner" : "engineer"}:${request.capabilityCode}`);
      }
    }

    const quoteSelfAssignment = resolveQuoteSelfAssignment(request, resource);
    if (quoteSelfAssignment) assignments.push(quoteSelfAssignment);
    if (resource?.resourceType === "need" && resource.public && request.capabilityCode === "quote.submit") {
      assignments.push({ capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF", subjectId: request.accountId, status: "active", dataScope: "PUBLIC" });
    }
    if (resource?.resourceType === "stored_file" && (resource.ownerAccountId === request.accountId || resource.public)) {
      assignments.push({ capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF", subjectId: request.accountId, status: "active", dataScope: resource.public ? "PUBLIC" : "OWNED_RESOURCE" });
    }
    if (isFileUploadInitializationRequest(request, resource)) {
      assignments.push({ capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF", subjectId: request.accountId, status: "active", dataScope: "SELF" });
    }
    if (resource?.resourceType === "conversation" && resource.memberAccountIds?.includes(request.accountId)) {
      assignments.push({ capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF", subjectId: request.accountId, status: "active", dataScope: "INVITED_RESOURCE" });
    }
    if (resource?.resourceType === "project" && request.capabilityCode === "message.start" && resource.memberAccountIds?.includes(request.accountId)) {
      assignments.push({ capabilityCode: request.capabilityCode, sourceType: "ACCOUNT_SELF", subjectId: request.accountId, status: "active", dataScope: "INVITED_RESOURCE" });
    }
    const selfResourceOwned = !resource || resource.ownerAccountId === request.accountId ||
      (request.capabilityCode === "organization.member.leave" && resource.organizationId === request.organizationId && organizationMembershipRow?.status === "active");
    if (ACCOUNT_SELF_CAPABILITIES.has(request.capabilityCode) && selfResourceOwned) {
      const selfScope: DataScope = request.capabilityCode === "organization.member.leave" ? "ORGANIZATION" : "SELF";
      assignments.push({
        capabilityCode: request.capabilityCode,
        sourceType: "ACCOUNT_SELF",
        subjectId: request.accountId,
        status: "active",
        dataScope: selfScope,
        allowedFields: [],
      });
    }

    const ndaAccepted = projectMembershipRow?.status === "active" && ["NDA", "RESTRICTED"].includes(projectMembershipRow.clearance ?? "");
    return {
      account: accountRow ? { id: accountRow.id, status: accountRow.status, legacyRole: accountRow.legacyRole, currentRole: accountRow.currentRole ?? undefined } : null,
      capability: capabilityRow ? {
        code: capabilityRow.code,
        status: capabilityRow.status,
        highRisk: capabilityRow.riskLevel === "high",
        requiredCertificationCodes,
      } : null,
      identity: identityRow ? { id: identityRow.id, accountId: identityRow.accountId, status: identityRow.status } : null,
      certifications: certificationRows.flatMap((row) => row.identityId == null || row.status === "not_applied" ? [] : [{
        identityId: row.identityId,
        code: row.code,
        status: row.status === "approved" && row.expiresAt && row.expiresAt.getTime() <= Date.now() ? "expired" as const : row.status,
      }]),
      organizationMembership: organizationMembershipRow ?? null,
      projectMembership: projectMembershipRow ? { id: projectMembershipRow.id, accountId: projectMembershipRow.accountId, scopeId: projectMembershipRow.scopeId, status: projectMembershipRow.status, confidentialityClearance: confidentiality(projectMembershipRow.clearance) } : null,
      assignments,
      resource,
      ndaAccepted,
      legacy: { role: accountRow?.legacyRole, currentRole: accountRow?.currentRole ?? undefined, workspacePreference: workspacePreference?.workspaceType, permissions: legacyPermissions },
    };
  }

  private async resolveResource(db: Db, request: AuthorizationRequest): Promise<ResourceFact | null> {
    const id = parseId(request.resourceId);
    if (!request.resourceType || id == null) return null;
    const base = (status: string, extra: Partial<ResourceFact>): ResourceFact => ({
      resourceType: request.resourceType!, resourceId: String(id), status,
      allowedStatuses: allowedStatuses(request.capabilityCode, status), confidentiality: "INTERNAL",
      availableFields: resourceFieldsFor(request.resourceType!), ...extra,
    });
    if (request.resourceType === "project") {
      const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.ownerId, projectId: row.id, memberAccountIds: [row.ownerId, row.engineerId], version: row.authorizationVersion }) : null;
    }
    if (request.resourceType === "identity") {
      const [row] = await db.select({
        id: businessIdentities.id,
        accountId: businessIdentities.accountId,
        status: businessIdentities.status,
        version: businessIdentities.version,
      }).from(businessIdentities).where(eq(businessIdentities.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.accountId, version: row.version, confidentiality: "CONFIDENTIAL" }) : null;
    }
    if (request.resourceType === "organization") {
      const [row] = await db.select({
        id: organizations.id,
        creatorAccountId: organizations.creatorAccountId,
        status: organizations.status,
        version: organizations.version,
      }).from(organizations).where(eq(organizations.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.creatorAccountId, organizationId: row.id, version: row.version, confidentiality: "INTERNAL" }) : null;
    }
    if (request.resourceType === "organization_invitation") {
      const [row] = await db.select({
        id: organizationInvitations.id,
        organizationId: organizationInvitations.organizationId,
        inviteeAccountId: organizationInvitations.inviteeAccountId,
        status: organizationInvitations.status,
        version: organizationInvitations.version,
      }).from(organizationInvitations).where(eq(organizationInvitations.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.inviteeAccountId ?? undefined, organizationId: row.organizationId, version: row.version, confidentiality: "INTERNAL" }) : null;
    }
    if (request.resourceType === "project_file") {
      const [row] = await db.select().from(projectFiles).where(eq(projectFiles.id, id)).limit(1);
      if (!row) return null;
      const [project] = await db.select({ ownerId: projects.ownerId, engineerId: projects.engineerId }).from(projects).where(eq(projects.id, row.projectId)).limit(1);
      return base(row.status, { ownerAccountId: row.uploadedBy, projectId: row.projectId, memberAccountIds: project ? [project.ownerId, project.engineerId] : [], confidentiality: confidentiality(row.confidentialityLevel), ndaRequired: row.ndaRequired, version: row.accessPolicyVersion });
    }
    if (request.resourceType === "milestone") {
      const [row] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
      if (!row) return null;
      const [submitter] = row.lastSubmittedByProjectMembershipId == null ? [] : await db.select({ accountId: projectMemberships.accountId }).from(projectMemberships).where(eq(projectMemberships.id, row.lastSubmittedByProjectMembershipId)).limit(1);
      return base(row.status, { projectId: row.projectId, version: row.authorizationVersion, workflowActors: { submittedByAccountId: submitter?.accountId } });
    }
    if (request.resourceType === "project_change") {
      const [row] = await db.select().from(projectChanges).where(eq(projectChanges.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.requesterId, projectId: row.projectId, workflowActors: { submittedByAccountId: row.requesterId } }) : null;
    }
    if (request.resourceType === "quote") {
      const [row] = await db.select({ id: quotes.id, needId: quotes.needId, engineerId: quotes.engineerId, status: quotes.status, creatorId: needs.creatorId }).from(quotes).innerJoin(needs, eq(needs.id, quotes.needId)).where(eq(quotes.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.creatorId, assigneeAccountId: row.engineerId, memberAccountIds: [row.creatorId, row.engineerId], public: false }) : null;
    }
    if (request.resourceType === "need") {
      const [row] = await db.select().from(needs).where(eq(needs.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.creatorId, memberAccountIds: [row.creatorId], public: row.visibility === "public", confidentiality: row.visibility === "public" ? "PUBLIC" : "INTERNAL" }) : null;
    }
    if (request.resourceType === "complaint") {
      const [row] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1);
      if (!row) return null;
      const [investigator] = await db.select({ actorId: complaintStatusLogs.actorId }).from(complaintStatusLogs)
        .where(and(eq(complaintStatusLogs.complaintId, id), or(eq(complaintStatusLogs.toStatus, "under_review"), eq(complaintStatusLogs.toStatus, "waiting_evidence"), eq(complaintStatusLogs.toStatus, "negotiating"))))
        .orderBy(desc(complaintStatusLogs.createdAt)).limit(1);
      return base(row.status, { ownerAccountId: row.complainantId, memberAccountIds: [row.complainantId, row.respondentId], workflowActors: { complaintInvestigatorAccountId: investigator?.actorId ?? undefined } });
    }
    if (request.resourceType === "conversation") {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return row ? base(row.status, { projectId: row.refType === "project" ? row.refId ?? undefined : undefined, memberAccountIds: [row.userAId, row.userBId], version: row.authorizationVersion }) : null;
    }
    if (request.resourceType === "refund") {
      const [row] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.requesterId, workflowActors: { financeReviewerAccountId: row.reviewedBy ?? undefined } }) : null;
    }
    if (request.resourceType === "settlement") {
      const [row] = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.payeeId, projectId: row.projectId, workflowActors: { financeReviewerAccountId: row.reviewedBy ?? undefined } }) : null;
    }
    if (request.resourceType === "stored_file") {
      const [row] = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
      return row ? base(row.status, { ownerAccountId: row.ownerId, public: row.privacyLevel === "public", confidentiality: row.privacyLevel === "public" ? "PUBLIC" : row.privacyLevel === "high_sensitive" ? "RESTRICTED" : row.privacyLevel === "sensitive" ? "CONFIDENTIAL" : "INTERNAL", version: row.accessPolicyVersion }) : null;
    }
    if (request.resourceType === "audit_event") {
      const [row] = await db.select({ id: permissionAuditEvents.id, decision: permissionAuditEvents.decision, actorAccountId: permissionAuditEvents.actorAccountId }).from(permissionAuditEvents).where(eq(permissionAuditEvents.id, id)).limit(1);
      return row ? base(row.decision, { ownerAccountId: row.actorAccountId ?? undefined, confidentiality: "RESTRICTED" }) : null;
    }
    if (request.resourceType.startsWith("verification:")) {
      const kind = request.resourceType.split(":")[1];
      const table = kind === "identity" ? identityVerifications : kind === "engineer" ? engineerVerifications : kind === "merchant" ? merchantVerifications : null;
      if (!table) return null;
      const [row] = await db.select({ id: table.id, userId: table.userId, status: table.status, reviewedBy: table.reviewedBy }).from(table).where(eq(table.id, id)).limit(1);
      if (!row) return null;
      const [initial] = await db.select({ actorId: verificationActions.actorId }).from(verificationActions)
        .where(and(eq(verificationActions.verificationType, kind as "identity" | "engineer" | "merchant"), eq(verificationActions.verificationId, id), eq(verificationActions.action, "approve")))
        .orderBy(desc(verificationActions.createdAt)).limit(1);
      return base(row.status, { ownerAccountId: row.userId, confidentiality: "RESTRICTED", workflowActors: { initialReviewerAccountId: initial?.actorId ?? row.reviewedBy ?? undefined } });
    }
    if (request.resourceType === "certification") {
      const [row] = await db.select({ id: certifications.id, status: certifications.status, identityId: certifications.subjectIdentityId }).from(certifications).where(eq(certifications.id, id)).limit(1);
      if (!row) return null;
      const [identity] = row.identityId == null ? [] : await db.select({ accountId: businessIdentities.accountId }).from(businessIdentities).where(eq(businessIdentities.id, row.identityId)).limit(1);
      const [initial] = await db.select({ actorId: certificationReviewActions.actorId }).from(certificationReviewActions)
        .where(and(eq(certificationReviewActions.certificationId, id), eq(certificationReviewActions.stage, "initial_review")))
        .orderBy(desc(certificationReviewActions.createdAt)).limit(1);
      return base(row.status, { ownerAccountId: identity?.accountId, confidentiality: "RESTRICTED", workflowActors: { initialReviewerAccountId: initial?.actorId ?? undefined } });
    }
    return null;
  }
}
