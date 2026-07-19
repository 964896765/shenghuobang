import type { AuthorizationReasonCode } from "./reason-codes";

export const DATA_SCOPES = ["SELF", "OWNED_RESOURCE", "ORGANIZATION", "PROJECT", "ASSIGNED_RESOURCE", "CITY_OR_REGION", "PUBLIC", "INVITED_RESOURCE", "PLATFORM_ASSIGNED", "PLATFORM_ALL"] as const;
export type DataScope = typeof DATA_SCOPES[number];

export const CONFIDENTIALITY_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "NDA", "RESTRICTED"] as const;
export type Confidentiality = typeof CONFIDENTIALITY_LEVELS[number];

export interface AuthorizationRequest {
  accountId: number;
  capabilityCode: string;
  identityId?: number | null;
  organizationId?: number | null;
  projectId?: number | null;
  platformStaffPositionId?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestedDataScope?: DataScope | null;
  purpose?: string | null;
  confidentiality?: Confidentiality | null;
  requestId?: string | null;
  view?: "list" | "detail" | "export";
  requestedFields?: string[];
  requireAllFields?: boolean;
  expectedResourceVersion?: number;
}

export interface AuthorizationResult {
  allowed: boolean;
  reasonCode: AuthorizationReasonCode;
  capabilityCode: string;
  resolvedDataScope: DataScope | null;
  resolvedIdentityId: number | null;
  resolvedOrganizationId: number | null;
  resolvedProjectId: number | null;
  resolvedPlatformStaffPositionId: number | null;
  fieldMask: string[];
  policyVersion: string;
  auditRequired: boolean;
}

export interface AccountFact { id: number; status: "active" | "restricted" | "suspended" | "closed"; legacyRole?: string; currentRole?: string }
export interface IdentityFact { id: number; accountId: number; status: "active" | "suspended" | "closed" }
export interface CertificationFact { identityId: number; code: string; status: "pending" | "additional_info_required" | "approved" | "rejected" | "revoked" | "expired" }
export interface MembershipFact { id: number; accountId: number; scopeId: number; status: "active" | "suspended" | "left" | "removed"; confidentialityClearance?: Confidentiality }
export type CapabilitySourceType = "ACCOUNT_SELF" | "ORGANIZATION_POSITION" | "PROJECT_ROLE" | "PLATFORM_POSITION" | "GRANT";
export interface CapabilityAssignment {
  capabilityCode: string;
  sourceType: CapabilitySourceType;
  subjectId: number;
  status: "active" | "suspended" | "revoked" | "expired";
  dataScope: DataScope;
  organizationId?: number;
  projectId?: number;
  platformStaffPositionId?: number;
  resourceType?: string;
  resourceId?: string;
  allowedFields?: string[];
}
export interface CapabilityFact {
  code: string;
  status: "active" | "inactive" | "deprecated";
  highRisk: boolean;
  requiredCertificationCodes?: string[];
}
export interface ResourceFact {
  resourceType: string;
  resourceId: string;
  status: string;
  allowedStatuses?: string[];
  ownerAccountId?: number;
  organizationId?: number;
  projectId?: number;
  assigneeAccountId?: number;
  memberAccountIds?: number[];
  confidentiality: Confidentiality;
  ndaRequired?: boolean;
  public?: boolean;
  version?: number;
  availableFields?: string[];
  workflowActors?: {
    submittedByAccountId?: number;
    initialReviewerAccountId?: number;
    complaintInvestigatorAccountId?: number;
    financeReviewerAccountId?: number;
    targetAccountId?: number;
    requestedPrivilege?: string;
  };
}

export interface AuthorizationFacts {
  account: AccountFact | null;
  capability: CapabilityFact | null;
  identity: IdentityFact | null;
  certifications: CertificationFact[];
  organizationMembership: MembershipFact | null;
  projectMembership: MembershipFact | null;
  assignments: CapabilityAssignment[];
  resource: ResourceFact | null;
  ndaAccepted: boolean;
  legacy: { role?: string; currentRole?: string; workspacePreference?: string; permissions?: string[] };
}

export interface AuthorizationDataSource {
  resolve(request: AuthorizationRequest): Promise<AuthorizationFacts>;
}

export interface PermissionAuditEvent {
  requestId: string | null;
  accountId: number;
  capabilityCode: string;
  decision: "allow" | "deny" | "changed";
  reasonCode: string;
  resourceType: string | null;
  resourceIdDigest: string | null;
  resolvedDataScope: DataScope | null;
  fieldMask: string[];
  policyVersion: string;
  resolvedIdentityId?: number | null;
  resolvedOrganizationId?: number | null;
  resolvedProjectId?: number | null;
  resolvedPlatformStaffPositionId?: number | null;
  confidentiality?: Confidentiality | null;
  compatibilityHit?: string;
  detail?: Record<string, unknown>;
}

export interface PermissionAuditWriter {
  write(event: PermissionAuditEvent): Promise<void>;
}
