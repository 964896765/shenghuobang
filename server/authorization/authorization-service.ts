import { resolveAuthorizationContext } from "./context-resolver";
import { resolveCapability, dataScopeMatches } from "./capability-resolver";
import { computeFieldMask } from "./field-mask";
import { LegacyAuthorizationAdapter } from "./legacy-adapter";
import { AUTHORIZATION_REASON_CODES, type AuthorizationReasonCode } from "./reason-codes";
import { resourceIdDigest } from "./audit-writer";
import { resourceRelationMatches, validateResource, validateSeparationOfDuties } from "./resource-resolver";
import type { AuthorizationDataSource, AuthorizationFacts, AuthorizationRequest, AuthorizationResult, PermissionAuditWriter } from "./types";

export const AUTHORIZATION_POLICY_VERSION = "v3.3-a3.2";

export class AuthorizationService {
  private readonly legacyAdapter: LegacyAuthorizationAdapter;

  constructor(
    private readonly source: AuthorizationDataSource,
    private readonly audit: PermissionAuditWriter,
  ) {
    this.legacyAdapter = new LegacyAuthorizationAdapter(audit);
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const facts = await resolveAuthorizationContext(this.source, request);
    await this.legacyAdapter.observe(request, facts.legacy);

    if (!facts.account || facts.account.status !== "active") return this.deny(request, AUTHORIZATION_REASON_CODES.ACCOUNT_INACTIVE);
    if (!facts.capability || facts.capability.status !== "active") return this.deny(request, AUTHORIZATION_REASON_CODES.CAPABILITY_MISSING);
    if ((request.identityId != null || facts.capability.requiredCertificationCodes?.length) && (!facts.identity || facts.identity.status !== "active")) {
      return this.deny(request, AUTHORIZATION_REASON_CODES.IDENTITY_INACTIVE);
    }
    if (facts.capability.requiredCertificationCodes?.some((code) => !facts.certifications.some((item) => item.code === code && item.status === "approved"))) {
      return this.deny(request, AUTHORIZATION_REASON_CODES.CERTIFICATION_INACTIVE);
    }

    const platformSourceActive = facts.assignments.some((item) => item.sourceType === "PLATFORM_POSITION" && item.status === "active");
    if (request.organizationId != null && !platformSourceActive && facts.organizationMembership?.status !== "active") {
      return this.deny(request, AUTHORIZATION_REASON_CODES.ORGANIZATION_MEMBERSHIP_INACTIVE);
    }
    if (request.projectId != null && !platformSourceActive && facts.projectMembership?.status !== "active") {
      return this.deny(request, AUTHORIZATION_REASON_CODES.PROJECT_MEMBERSHIP_INACTIVE);
    }

    const capability = resolveCapability(request, facts);
    if (!capability.assignment) return this.deny(request, capability.reasonCode);
    if (request.requestedDataScope && capability.dataScope !== request.requestedDataScope && capability.dataScope !== "PLATFORM_ALL") {
      return this.deny(request, AUTHORIZATION_REASON_CODES.DATA_SCOPE_MISMATCH);
    }
    if (!dataScopeMatches(request, facts, capability.assignment)) return this.deny(request, AUTHORIZATION_REASON_CODES.DATA_SCOPE_MISMATCH);
    if (!resourceRelationMatches(request, facts)) return this.deny(request, AUTHORIZATION_REASON_CODES.RESOURCE_RELATION_REQUIRED);

    const resourceReason = validateResource(request, facts);
    if (resourceReason !== AUTHORIZATION_REASON_CODES.ALLOWED) return this.deny(request, resourceReason);
    const separationReason = validateSeparationOfDuties(request, facts);
    if (separationReason !== AUTHORIZATION_REASON_CODES.ALLOWED) return this.deny(request, separationReason);

    const availableFields = request.requestedFields ?? facts.resource?.availableFields ?? [];
    const fieldMask = computeFieldMask({ availableFields, fieldAccess: capability.fieldAccess, view: request.view ?? "detail" });
    if (request.requireAllFields && fieldMask.some((field) => availableFields.includes(field))) {
      return this.deny(request, AUTHORIZATION_REASON_CODES.FIELD_ACCESS_DENIED, fieldMask);
    }

    const result: AuthorizationResult = {
      allowed: true,
      reasonCode: AUTHORIZATION_REASON_CODES.ALLOWED,
      capabilityCode: request.capabilityCode,
      resolvedDataScope: capability.dataScope,
      resolvedIdentityId: facts.identity?.id ?? null,
      resolvedOrganizationId: facts.organizationMembership?.scopeId ?? null,
      resolvedProjectId: facts.projectMembership?.scopeId ?? null,
      resolvedPlatformStaffPositionId: capability.assignment.platformStaffPositionId ?? null,
      fieldMask,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      auditRequired: facts.capability.highRisk,
    };
    if (result.auditRequired) await this.writeDecisionAudit(request, result, facts);
    return result;
  }

  private async deny(request: AuthorizationRequest, reasonCode: AuthorizationReasonCode, fieldMask: string[] = []): Promise<AuthorizationResult> {
    const result: AuthorizationResult = {
      allowed: false,
      reasonCode,
      capabilityCode: request.capabilityCode,
      resolvedDataScope: null,
      resolvedIdentityId: null,
      resolvedOrganizationId: null,
      resolvedProjectId: null,
      resolvedPlatformStaffPositionId: null,
      fieldMask,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      auditRequired: true,
    };
    await this.writeDecisionAudit(request, result);
    return result;
  }

  private async writeDecisionAudit(request: AuthorizationRequest, result: AuthorizationResult, facts?: AuthorizationFacts) {
    await this.audit.write({
      requestId: request.requestId ?? null,
      accountId: request.accountId,
      capabilityCode: request.capabilityCode,
      decision: result.allowed ? "allow" : "deny",
      reasonCode: result.reasonCode,
      resourceType: request.resourceType ?? null,
      resourceIdDigest: resourceIdDigest(request.resourceType, request.resourceId),
      resolvedDataScope: result.resolvedDataScope,
      fieldMask: result.fieldMask,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      resolvedIdentityId: result.resolvedIdentityId,
      resolvedOrganizationId: result.resolvedOrganizationId,
      resolvedProjectId: result.resolvedProjectId,
      resolvedPlatformStaffPositionId: result.resolvedPlatformStaffPositionId,
      confidentiality: request.confidentiality ?? null,
      detail: {
        highRisk: facts?.capability?.highRisk ?? false,
        purposeCode: request.purpose ?? "unspecified",
      },
    });
  }
}
