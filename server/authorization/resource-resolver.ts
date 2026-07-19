import { AUTHORIZATION_REASON_CODES, type AuthorizationReasonCode } from "./reason-codes";
import type { AuthorizationFacts, AuthorizationRequest, Confidentiality } from "./types";

const clearanceRank: Record<Confidentiality, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  NDA: 3,
  RESTRICTED: 4,
};

export function resourceRelationMatches(request: AuthorizationRequest, facts: AuthorizationFacts): boolean {
  if (!request.resourceType && !request.resourceId) return true;
  const resource = facts.resource;
  if (!resource) return false;
  return resource.ownerAccountId === request.accountId ||
    resource.assigneeAccountId === request.accountId ||
    resource.memberAccountIds?.includes(request.accountId) === true ||
    (request.organizationId != null && resource.organizationId === request.organizationId && facts.organizationMembership?.status === "active") ||
    (request.projectId != null && resource.projectId === request.projectId && facts.projectMembership?.status === "active") ||
    resource.public === true ||
    facts.assignments.some((item) => item.status === "active" && ["PLATFORM_ASSIGNED", "PLATFORM_ALL"].includes(item.dataScope));
}

export function validateResource(request: AuthorizationRequest, facts: AuthorizationFacts): AuthorizationReasonCode {
  const resource = facts.resource;
  if ((request.resourceType || request.resourceId) && !resource) return AUTHORIZATION_REASON_CODES.RESOURCE_RELATION_REQUIRED;
  if (!resource) return AUTHORIZATION_REASON_CODES.ALLOWED;
  if (resource.allowedStatuses && !resource.allowedStatuses.includes(resource.status)) return AUTHORIZATION_REASON_CODES.RESOURCE_STATE_FORBIDDEN;
  if (request.expectedResourceVersion != null && resource.version !== request.expectedResourceVersion) return AUTHORIZATION_REASON_CODES.CONCURRENT_MODIFICATION;
  const platformClearance = facts.assignments.some((item) => item.sourceType === "PLATFORM_POSITION" && item.status === "active") ? "RESTRICTED" : null;
  const ownerClearance = resource.ownerAccountId === request.accountId ? "RESTRICTED" : null;
  const memberClearance = resource.memberAccountIds?.includes(request.accountId) ? "INTERNAL" : null;
  const clearance = platformClearance ?? ownerClearance ?? facts.projectMembership?.confidentialityClearance ?? request.confidentiality ?? memberClearance ?? "PUBLIC";
  if (clearanceRank[clearance] < clearanceRank[resource.confidentiality]) return AUTHORIZATION_REASON_CODES.CONFIDENTIALITY_TOO_HIGH;
  if ((resource.ndaRequired || resource.confidentiality === "NDA") && !facts.ndaAccepted) return AUTHORIZATION_REASON_CODES.NDA_REQUIRED;
  return AUTHORIZATION_REASON_CODES.ALLOWED;
}

export function validateSeparationOfDuties(request: AuthorizationRequest, facts: AuthorizationFacts): AuthorizationReasonCode {
  const actors = facts.resource?.workflowActors;
  if (!actors) return AUTHORIZATION_REASON_CODES.ALLOWED;
  if (/accept|approv/.test(request.capabilityCode) && actors.submittedByAccountId === request.accountId) return AUTHORIZATION_REASON_CODES.SELF_APPROVAL_FORBIDDEN;
  if (/certification.*review_final/.test(request.capabilityCode) && actors.initialReviewerAccountId === request.accountId) return AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES;
  if (/complaint.*decide/.test(request.capabilityCode) && actors.complaintInvestigatorAccountId === request.accountId) return AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES;
  if (/(finance|funds|refund|settlement).*(execute|release)/.test(request.capabilityCode) && actors.financeReviewerAccountId === request.accountId) return AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES;
  if (/permission|grant|staff/.test(request.capabilityCode) && actors.targetAccountId === request.accountId && /super_administrator|PLATFORM_ALL/i.test(actors.requestedPrivilege ?? "")) return AUTHORIZATION_REASON_CODES.SEPARATION_OF_DUTIES;
  return AUTHORIZATION_REASON_CODES.ALLOWED;
}
