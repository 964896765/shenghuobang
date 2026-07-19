import type {
  AccountFact,
  AuthorizationDataSource,
  AuthorizationFacts,
  AuthorizationRequest,
  CapabilityAssignment,
  CapabilityFact,
  CertificationFact,
  IdentityFact,
  MembershipFact,
  ResourceFact,
} from "./types";

export interface MemoryAuthorizationDataset {
  accounts: AccountFact[];
  capabilities: CapabilityFact[];
  identities?: IdentityFact[];
  certifications?: CertificationFact[];
  organizationMemberships?: MembershipFact[];
  projectMemberships?: MembershipFact[];
  assignments?: CapabilityAssignment[];
  resources?: ResourceFact[];
  ndaAcceptances?: Array<{ accountId: number; resourceType: string; resourceId: string; active: boolean }>;
  legacyPermissions?: Record<string, string[]>;
}

export class MemoryAuthorizationDataSource implements AuthorizationDataSource {
  constructor(readonly dataset: MemoryAuthorizationDataset) {}

  async resolve(request: AuthorizationRequest): Promise<AuthorizationFacts> {
    const account = this.dataset.accounts.find((item) => item.id === request.accountId) ?? null;
    const identity = request.identityId == null
      ? null
      : this.dataset.identities?.find((item) => item.id === request.identityId && item.accountId === request.accountId) ?? null;
    const organizationMembership = request.organizationId == null
      ? null
      : this.dataset.organizationMemberships?.find((item) => item.accountId === request.accountId && item.scopeId === request.organizationId) ?? null;
    const projectMembership = request.projectId == null
      ? null
      : this.dataset.projectMemberships?.find((item) => item.accountId === request.accountId && item.scopeId === request.projectId) ?? null;
    const resource = request.resourceType && request.resourceId
      ? this.dataset.resources?.find((item) => item.resourceType === request.resourceType && item.resourceId === request.resourceId) ?? null
      : null;

    const assignments = (this.dataset.assignments ?? []).filter((item) => {
      if (item.capabilityCode !== request.capabilityCode) return false;
      if (item.sourceType === "ACCOUNT_SELF") return item.subjectId === request.accountId;
      if (item.sourceType === "ORGANIZATION_POSITION") return organizationMembership !== null && item.organizationId === request.organizationId && item.subjectId === organizationMembership.id;
      if (item.sourceType === "PROJECT_ROLE") return projectMembership !== null && item.projectId === request.projectId && item.subjectId === projectMembership.id;
      if (item.sourceType === "PLATFORM_POSITION") return (request.platformStaffPositionId == null || item.platformStaffPositionId === request.platformStaffPositionId) && item.subjectId === request.accountId;
      return item.subjectId === request.accountId || item.subjectId === identity?.id || item.subjectId === organizationMembership?.id || item.subjectId === projectMembership?.id;
    });

    const ndaAccepted = Boolean(
      request.resourceType && request.resourceId && this.dataset.ndaAcceptances?.some(
        (item) => item.accountId === request.accountId && item.resourceType === request.resourceType && item.resourceId === request.resourceId && item.active,
      ),
    );
    return {
      account,
      capability: this.dataset.capabilities.find((item) => item.code === request.capabilityCode) ?? null,
      identity,
      certifications: identity ? (this.dataset.certifications ?? []).filter((item) => item.identityId === identity.id) : [],
      organizationMembership,
      projectMembership,
      assignments,
      resource,
      ndaAccepted,
      legacy: {
        role: account?.legacyRole,
        currentRole: account?.currentRole,
        permissions: account?.legacyRole ? this.dataset.legacyPermissions?.[account.legacyRole] ?? [] : [],
      },
    };
  }
}

export async function resolveAuthorizationContext(source: AuthorizationDataSource, request: AuthorizationRequest) {
  return source.resolve(request);
}
