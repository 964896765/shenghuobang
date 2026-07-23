import { AUTHORIZATION_REASON_CODES, type AuthorizationReasonCode } from "./reason-codes";
import type { AuthorizationFacts, AuthorizationRequest, CapabilityAssignment, DataScope } from "./types";

export interface CapabilityResolution {
  assignment: CapabilityAssignment | null;
  dataScope: DataScope | null;
  reasonCode: AuthorizationReasonCode;
  fieldAccess: string[];
}

export const PLATFORM_POSITION_CAPABILITY_MAP: Readonly<Record<string, readonly string[]>> = {
  customer_service: ["platform.workspace.access", "platform.complaint.read"],
  certification_initial_reviewer: ["platform.workspace.access", "platform.certification.queue_read", "platform.certification.document_read", "platform.certification.review_initial"],
  certification_final_reviewer: ["platform.workspace.access", "platform.certification.queue_read", "platform.certification.document_read", "platform.certification.review_final"],
  complaint_investigator: ["platform.workspace.access", "platform.complaint.read", "platform.complaint.investigate"],
  complaint_decider: ["platform.workspace.access", "platform.complaint.read", "platform.complaint.decide"],
  finance_reviewer: ["platform.workspace.access", "platform.finance.read", "platform.finance.review"],
  funds_executor: ["platform.workspace.access", "platform.finance.read", "platform.funds.execute"],
  security_auditor: ["platform.workspace.access", "platform.audit.read"],
  permission_administrator: ["platform.workspace.access", "platform.permission.manage"],
  super_administrator: [
    "platform.workspace.access",
    "platform.certification.queue_read", "platform.certification.document_read", "platform.certification.review_initial", "platform.certification.review_final", "platform.certification.revoke",
    "platform.complaint.read", "platform.complaint.investigate", "platform.complaint.decide",
    "platform.finance.read", "platform.finance.review", "platform.funds.execute",
    "platform.audit.read", "platform.permission.manage",
  ],
};

export function capabilitiesForPlatformPosition(positionCode: string): readonly string[] {
  return PLATFORM_POSITION_CAPABILITY_MAP[positionCode] ?? [];
}

export function resolveCapability(request: AuthorizationRequest, facts: AuthorizationFacts): CapabilityResolution {
  const active = facts.assignments.filter((item) => item.status === "active");
  if (request.platformStaffPositionId != null) {
    const staffFacts = facts.assignments.filter((item) => item.sourceType === "PLATFORM_POSITION");
    if (staffFacts.length === 0 || staffFacts.every((item) => item.status !== "active")) {
      return { assignment: null, dataScope: null, reasonCode: AUTHORIZATION_REASON_CODES.STAFF_POSITION_INACTIVE, fieldAccess: [] };
    }
  }
  if (active.length === 0) {
    const grantFacts = facts.assignments.filter((item) => item.sourceType === "GRANT");
    return {
      assignment: null,
      dataScope: null,
      reasonCode: grantFacts.length > 0 ? AUTHORIZATION_REASON_CODES.GRANT_INACTIVE : AUTHORIZATION_REASON_CODES.CAPABILITY_MISSING,
      fieldAccess: [],
    };
  }
  const requested = request.requestedDataScope;
  const assignment = requested ? active.find((item) => item.dataScope === requested || item.dataScope === "PLATFORM_ALL") ?? active[0] : active[0];
  return {
    assignment,
    dataScope: assignment.dataScope,
    reasonCode: AUTHORIZATION_REASON_CODES.ALLOWED,
    fieldAccess: [...new Set(active.flatMap((item) => item.allowedFields ?? []))],
  };
}

export function dataScopeMatches(request: AuthorizationRequest, facts: AuthorizationFacts, assignment: CapabilityAssignment): boolean {
  const resource = facts.resource;
  switch (assignment.dataScope) {
    case "PLATFORM_ALL": return true;
    case "PLATFORM_ASSIGNED": return !resource && !request.resourceType
      ? true
      : Boolean(resource && (!assignment.resourceType || assignment.resourceType === resource.resourceType) && (!assignment.resourceId || assignment.resourceId === resource.resourceId));
    case "SELF": return !resource || resource.ownerAccountId === request.accountId;
    case "OWNED_RESOURCE": return resource?.ownerAccountId === request.accountId;
    case "ORGANIZATION": return Boolean(request.organizationId && facts.organizationMembership?.status === "active" && resource?.organizationId === request.organizationId);
    case "PROJECT": return Boolean(request.projectId && facts.projectMembership?.status === "active" && resource?.projectId === request.projectId);
    case "ASSIGNED_RESOURCE": return resource?.assigneeAccountId === request.accountId;
    case "INVITED_RESOURCE": return Boolean(resource?.memberAccountIds?.includes(request.accountId) ||
      (["idea.invitation.accept", "idea.nda.accept"].includes(request.capabilityCode) && resource?.pendingInviteeAccountIds?.includes(request.accountId)) ||
      (request.capabilityCode === "idea.view_private" && resource?.ndaRequired && resource.pendingInviteeAccountIds?.includes(request.accountId)));
    case "PUBLIC": return resource?.public === true;
    case "CITY_OR_REGION": return resource?.public === true;
  }
}
