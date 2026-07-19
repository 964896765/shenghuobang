import crypto from "node:crypto";

export const ACTIVE_CERTIFICATION_STATUSES = new Set(["pending", "additional_info_required", "approved"]);
export const RESUBMITTABLE_CERTIFICATION_STATUSES = new Set(["additional_info_required", "rejected", "revoked", "expired"]);
export const ACTIVE_MEMBERSHIP_STATUS = "active" as const;

export type IdentityKind = "consumer" | "engineer" | "merchant";
export type CertificationKind = "real_name" | "engineer_basic" | "merchant_business_license";

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeRequestId(value?: string | null): string {
  return value && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : crypto.randomUUID();
}

export function certificationDedupeKey(identityId: number, certificationTypeId: number): string {
  return `cert|identity:${identityId}|${certificationTypeId}`;
}

export function organizationInvitationDedupeKey(organizationId: number, inviteeAccountId: number): string {
  return `orginv|${organizationId}|account:${inviteeAccountId}`;
}

export function redactCertificationApplication(
  kind: CertificationKind,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const safe = { ...input };
  const digestAndRemove = (key: string, digestKey: string, last4Key: string) => {
    const value = safe[key];
    if (typeof value !== "string" || !value.trim()) return;
    safe[digestKey] = sha256(value.trim().toUpperCase());
    safe[last4Key] = value.trim().slice(-4);
    delete safe[key];
  };
  digestAndRemove("idNumber", "idNumberDigest", "idNumberLast4");
  digestAndRemove("registrationNo", "registrationNoDigest", "registrationNoLast4");
  for (const key of ["phone", "email", "address", "addressText", "token", "storageKey", "fileUrl", "businessLicenseUrl", "identityDocumentUrl"]) {
    delete safe[key];
  }
  return { kind, ...safe };
}

export function compatibilityRoleForWorkspace(input: {
  workspaceType: "personal" | "identity" | "organization" | "platform";
  identityTypeCode?: string | null;
}): "user" | "engineer" | "merchant" {
  if (input.workspaceType === "identity" && input.identityTypeCode === "engineer") return "engineer";
  if (input.workspaceType === "identity" && input.identityTypeCode === "merchant") return "merchant";
  return "user";
}

export function assertIdentityOwner(identity: { accountId: number; status: string } | null | undefined, accountId: number): void {
  if (!identity || identity.accountId !== accountId) throw new Error("IDENTITY_INACTIVE");
  if (identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
}

export function assertMembershipActive(membership: { accountId: number; status: string } | null | undefined, accountId: number): void {
  if (!membership || membership.accountId !== accountId || membership.status !== ACTIVE_MEMBERSHIP_STATUS) {
    throw new Error("ORGANIZATION_MEMBERSHIP_INACTIVE");
  }
}

export function identityWorkspaceAvailability(input: {
  identity: { accountId: number; status: string } | null | undefined;
  accountId: number;
  certificationStatus?: string | null;
}): { available: boolean; reasonCode: string | null } {
  if (!input.identity || input.identity.accountId !== input.accountId || input.identity.status !== "active") return { available: false, reasonCode: "IDENTITY_INACTIVE" };
  if (input.certificationStatus && ["revoked", "expired"].includes(input.certificationStatus)) return { available: false, reasonCode: "CERTIFICATION_INACTIVE" };
  return { available: true, reasonCode: null };
}

export function organizationWorkspaceAvailability(input: {
  membership: { accountId: number; status: string } | null | undefined;
  accountId: number;
  organizationStatus?: string | null;
}): { available: boolean; reasonCode: string | null } {
  if (!input.membership || input.membership.accountId !== input.accountId || input.membership.status !== "active") return { available: false, reasonCode: "ORGANIZATION_MEMBERSHIP_INACTIVE" };
  if (input.organizationStatus !== "active") return { available: false, reasonCode: "RESOURCE_STATE_FORBIDDEN" };
  return { available: true, reasonCode: null };
}

export const ORGANIZATION_OWNER_CAPABILITIES = [
  "organization.view",
  "organization.update",
  "organization.member.list",
  "organization.member.invite",
  "organization.member.suspend",
  "organization.member.restore",
  "organization.member.remove",
  "organization.member.assign_position",
  "organization.position.manage",
  "organization.owner.transfer",
] as const;

export const CLIENT_SAFE_CERTIFICATION_FIELDS = [
  "id", "applicationNo", "certificationTypeId", "subjectIdentityId", "subjectOrganizationId", "status",
  "submittedAt", "approvedAt", "expiresAt", "revokedAt", "decisionReasonCode", "createdAt", "updatedAt",
] as const;
