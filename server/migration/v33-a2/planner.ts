import {
  anomalyRecord,
  type AnomalyCode,
  type AnomalyHandling,
  type AnomalySeverity,
} from "./contract";

type LegacyRole = "user" | "admin" | "verification_reviewer" | "complaint_operator" | "finance_operator" | "customer_service" | string;
type LegacyVerificationStatus = "draft" | "submitted" | "under_review" | "additional_info_required" | "approved" | "rejected" | "revoked";

export interface LegacyProfile {
  currentRole: "user" | "engineer" | "merchant";
  engineerStatus: "none" | "pending" | "active" | "rejected";
  merchantStatus: "none" | "pending" | "active" | "rejected";
  cityCode?: string | null;
  cityName?: string | null;
}

export interface LegacyEngineerProfile {
  displayName?: string | null;
  professionalTitle?: string | null;
  introduction?: string | null;
  skills?: unknown;
  cityName?: string | null;
  primaryCategory?: string | null;
  yearsOfExperience?: number | null;
  startingPrice?: number | null;
  supportsRemote?: boolean | null;
  supportsOnsite?: boolean | null;
}

export interface LegacyMerchantProfile {
  displayName: string;
  categories?: unknown;
  description?: string | null;
  cityName?: string | null;
  supportsHomeService?: boolean | null;
}

export interface LegacyVerification {
  id: number;
  kind: "identity" | "engineer" | "merchant";
  accountId: number;
  status: LegacyVerificationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  rejectReason?: string | null;
  idNumberDigest?: string | null;
  idNumberLast4?: string | null;
  registrationNoDigest?: string | null;
  registrationNoLast4?: string | null;
}

export interface LegacyUser {
  id: number;
  role: LegacyRole;
  createdAt: string;
  profile?: LegacyProfile | null;
  engineerProfile?: LegacyEngineerProfile | null;
  merchantProfile?: LegacyMerchantProfile | null;
}

export interface LegacyProject {
  id: number;
  ownerId: number;
  engineerId: number;
  createdAt: string;
}

export interface LegacyAcceptance {
  id: number;
  projectId: number;
  milestoneId: number;
  submittedBy: number;
}

export interface LegacyVerificationDocument {
  id: number;
  verificationType: "identity" | "engineer" | "merchant";
  verificationId: number;
  ownerId: number;
  documentType: string;
  storedFileId?: number | null;
  status: "available" | "superseded" | "disabled";
}

export interface LegacyVerificationAction {
  id: number;
  verificationType: "identity" | "engineer" | "merchant";
  verificationId: number;
  actorId: number;
  action: "submit" | "resubmit" | "start_review" | "approve" | "request_info" | "reject" | "revoke";
  fromStatus?: string | null;
  toStatus: string;
  reason?: string | null;
  createdAt: string;
}

export interface LegacyFixture {
  users: LegacyUser[];
  verifications: LegacyVerification[];
  projects: LegacyProject[];
  acceptances: LegacyAcceptance[];
  verificationDocuments?: LegacyVerificationDocument[];
  verificationActions?: LegacyVerificationAction[];
}

export interface PlannedAnomaly {
  entityType: string;
  entityId?: number;
  code: AnomalyCode;
  severity: AnomalySeverity;
  handling: AnomalyHandling;
  detail: Record<string, unknown>;
  fingerprint: string;
  detailChecksum: string;
}

const staffRoleMap: Record<string, string | undefined> = {
  admin: "super_administrator",
  verification_reviewer: "certification_initial_reviewer",
  complaint_operator: "complaint_investigator",
  finance_operator: "finance_reviewer",
  customer_service: "customer_service",
};

const verificationTypeMap = {
  identity: "real_name",
  engineer: "engineer_basic",
  merchant: "merchant_business_license",
} as const;

const verificationStatusMap: Record<LegacyVerificationStatus, string> = {
  draft: "not_applied",
  submitted: "pending",
  under_review: "pending",
  additional_info_required: "additional_info_required",
  approved: "approved",
  rejected: "rejected",
  revoked: "revoked",
};

export function planLegacyBackfill(
  fixture: LegacyFixture,
  context: { migrationRunId: string; sourceChecksum: string },
) {
  const usersById = new Map(fixture.users.map((user) => [user.id, user]));
  const identityKeys = new Set<string>();
  const identities: Array<{ accountId: number; identityTypeCode: string }> = [];
  const profiles: Array<Record<string, unknown>> = [];
  const anomalies: PlannedAnomaly[] = [];
  const addAnomaly = (input: Omit<Parameters<typeof anomalyRecord>[0], "migrationRunId" | "sourceChecksum">) => {
    const result = anomalyRecord({ ...context, ...input });
    anomalies.push(result);
  };
  const addIdentity = (accountId: number, identityTypeCode: string) => {
    const key = `${accountId}|${identityTypeCode}`;
    if (!identityKeys.has(key)) {
      identityKeys.add(key);
      identities.push({ accountId, identityTypeCode });
    }
  };

  for (const user of [...fixture.users].sort((a, b) => a.id - b.id)) {
    addIdentity(user.id, "consumer");
    const hasEngineer = Boolean(user.engineerProfile) || user.profile?.engineerStatus !== undefined && user.profile.engineerStatus !== "none" || fixture.verifications.some((item) => item.accountId === user.id && item.kind === "engineer");
    const hasMerchant = Boolean(user.merchantProfile) || user.profile?.merchantStatus !== undefined && user.profile.merchantStatus !== "none" || fixture.verifications.some((item) => item.accountId === user.id && item.kind === "merchant");
    if (hasEngineer) addIdentity(user.id, "engineer");
    if (hasMerchant) addIdentity(user.id, "merchant");
    if (user.profile?.engineerStatus === "active" && !fixture.verifications.some((item) => item.accountId === user.id && item.kind === "engineer")) {
      addAnomaly({ entityType: "account", entityId: user.id, code: "MIG-STATE-CONFLICT", detail: { sourceTable: "user_profiles", entityId: user.id, fieldName: "engineerStatus", actualEnum: "active", expected: "verification_fact", ruleCode: "NO_PRIVILEGE_ELEVATION" } });
    }
    if (user.profile?.merchantStatus === "active" && !fixture.verifications.some((item) => item.accountId === user.id && item.kind === "merchant")) {
      addAnomaly({ entityType: "account", entityId: user.id, code: "MIG-STATE-CONFLICT", detail: { sourceTable: "user_profiles", entityId: user.id, fieldName: "merchantStatus", actualEnum: "active", expected: "verification_fact", ruleCode: "NO_PRIVILEGE_ELEVATION" } });
    }

    if (user.engineerProfile) {
      const skills = Array.isArray(user.engineerProfile.skills) ? user.engineerProfile.skills : undefined;
      if (user.engineerProfile.skills !== undefined && !skills) {
        addAnomaly({ entityType: "engineer_profile", entityId: user.id, code: "MIG-INVALID-LEGACY-JSON", detail: { sourceTable: "engineer_profiles", entityId: user.id, fieldName: "skills", ruleCode: "ARRAY_REQUIRED" } });
      }
      profiles.push({
        accountId: user.id,
        identityTypeCode: "engineer",
        displayName: user.engineerProfile.displayName ?? null,
        professionalTitle: user.engineerProfile.professionalTitle ?? null,
        introduction: user.engineerProfile.introduction ?? null,
        skills,
        cityName: user.engineerProfile.cityName ?? null,
        profileData: {
          primaryCategory: user.engineerProfile.primaryCategory ?? null,
          yearsOfExperience: user.engineerProfile.yearsOfExperience ?? 0,
          startingPriceLegacyYuan: user.engineerProfile.startingPrice ?? 0,
          supportsRemote: user.engineerProfile.supportsRemote ?? true,
          supportsOnsite: user.engineerProfile.supportsOnsite ?? false,
        },
      });
    }
    if (user.merchantProfile) {
      const categories = Array.isArray(user.merchantProfile.categories) ? user.merchantProfile.categories : undefined;
      if (user.merchantProfile.categories !== undefined && !categories) {
        addAnomaly({ entityType: "merchant_profile", entityId: user.id, code: "MIG-INVALID-LEGACY-JSON", detail: { sourceTable: "merchant_profiles", entityId: user.id, fieldName: "categories", ruleCode: "ARRAY_REQUIRED" } });
      }
      profiles.push({
        accountId: user.id,
        identityTypeCode: "merchant",
        displayName: user.merchantProfile.displayName,
        introduction: user.merchantProfile.description ?? null,
        skills: categories,
        cityName: user.merchantProfile.cityName ?? null,
        profileData: { supportsHomeService: user.merchantProfile.supportsHomeService ?? true },
      });
    }
  }

  const certifications = fixture.verifications.map((verification) => {
    if (!usersById.has(verification.accountId)) {
      addAnomaly({ entityType: `${verification.kind}_verification`, entityId: verification.id, code: "MIG-MISSING-USER", detail: { sourceTable: `${verification.kind}_verifications`, entityId: verification.id, fieldName: "userId", ruleCode: "FK_REQUIRED" } });
    }
    const identityTypeCode = verification.kind === "identity" ? "consumer" : verification.kind;
    addIdentity(verification.accountId, identityTypeCode);
    return {
      applicationNo: `LEGACY-${verification.kind.toUpperCase()}-${verification.id}`,
      accountId: verification.accountId,
      identityTypeCode,
      certificationTypeCode: verificationTypeMap[verification.kind],
      status: verificationStatusMap[verification.status],
      legacySourceType: `${verification.kind}_verifications`,
      legacySourceId: verification.id,
      submittedAt: verification.submittedAt,
      approvedAt: verification.status === "approved" ? verification.reviewedAt ?? null : null,
      applicationData: {
        legacySingleStage: true,
        idNumberDigest: verification.idNumberDigest ?? undefined,
        idNumberLast4: verification.idNumberLast4 ?? undefined,
        registrationNoDigest: verification.registrationNoDigest ?? undefined,
        registrationNoLast4: verification.registrationNoLast4 ?? undefined,
      },
    };
  });

  const certificationDocuments = (fixture.verificationDocuments ?? []).flatMap((document) => {
    if (!document.storedFileId) {
      addAnomaly({ entityType: "verification_document", entityId: document.id, code: "MIG-ORPHAN-DOCUMENT", detail: { sourceTable: "verification_documents", entityId: document.id, fieldName: "storageKey", ruleCode: "STORED_FILE_REQUIRED", verificationType: document.verificationType } });
      return [];
    }
    return [{
      legacyId: document.id,
      legacySourceType: `${document.verificationType}_verifications`,
      legacySourceId: document.verificationId,
      fileId: document.storedFileId,
      documentType: document.documentType,
      uploadedBy: document.ownerId,
      status: document.status,
    }];
  });

  const certificationReviewActions = (fixture.verificationActions ?? []).map((action) => ({
    legacyId: action.id,
    legacySourceType: `${action.verificationType}_verifications`,
    legacySourceId: action.verificationId,
    stage: action.action === "submit" || action.action === "resubmit" ? "submission" : action.action === "revoke" ? "revocation" : "initial_review",
    action: action.action,
    fromStatus: action.fromStatus ?? null,
    toStatus: verificationStatusMap[action.toStatus as LegacyVerificationStatus] ?? action.toStatus,
    actorId: action.actorId,
    reason: action.reason ?? null,
    requestId: `mig|verification_action|${action.id}`,
    createdAt: action.createdAt,
  }));

  const memberships: Array<{ projectId: number; accountId: number; roles: string[] }> = [];
  for (const project of fixture.projects) {
    const byAccount = new Map<number, Set<string>>();
    for (const [accountId, role] of [[project.ownerId, "initiator"], [project.engineerId, "engineer"]] as const) {
      if (!usersById.has(accountId)) {
        addAnomaly({ entityType: "project", entityId: project.id, code: "MIG-MISSING-USER", detail: { sourceTable: "projects", entityId: project.id, fieldName: role === "initiator" ? "ownerId" : "engineerId", ruleCode: "FK_REQUIRED", projectId: project.id } });
        continue;
      }
      const roles = byAccount.get(accountId) ?? new Set<string>();
      roles.add(role);
      byAccount.set(accountId, roles);
    }
    for (const [accountId, roles] of byAccount) memberships.push({ projectId: project.id, accountId, roles: [...roles].sort() });
  }

  const platformPositions = fixture.users.flatMap((user) => {
    if (user.role === "user") return [];
    const positionCode = staffRoleMap[user.role];
    if (!positionCode) {
      addAnomaly({ entityType: "account", entityId: user.id, code: "MIG-UNMAPPED-LEGACY-ROLE", detail: { sourceTable: "users", entityId: user.id, fieldName: "role", actualEnum: user.role, ruleCode: "MIN_PRIVILEGE" } });
      return [];
    }
    return [{ accountId: user.id, positionCode, validFrom: user.createdAt, activeDedupeKey: `staff|${user.id}|${positionCode}|${"44136fa355b3678a1146ad16f7e8649e"}` }];
  });

  const workspacePreferences = fixture.users.map((user) => {
    const preferred = user.profile?.currentRole;
    if ((preferred === "engineer" || preferred === "merchant") && identityKeys.has(`${user.id}|${preferred}`)) {
      return { accountId: user.id, workspaceType: "identity", identityTypeCode: preferred, lastUsedAt: user.createdAt };
    }
    return { accountId: user.id, workspaceType: "personal", identityTypeCode: null, lastUsedAt: user.createdAt };
  });

  for (const acceptance of fixture.acceptances) {
    addAnomaly({ entityType: "project_acceptance", entityId: acceptance.id, code: "MIG-REVIEWER-UNKNOWN", detail: { sourceTable: "project_acceptances", entityId: acceptance.id, fieldName: "reviewerProjectMembershipId", ruleCode: "NO_REVIEWER_FACT", projectId: acceptance.projectId, milestoneId: acceptance.milestoneId } });
  }

  return {
    identities,
    profiles,
    certifications,
    certificationDocuments,
    certificationReviewActions,
    memberships,
    platformPositions,
    workspacePreferences,
    reviewerUpdates: [] as never[],
    anomalies,
  };
}
