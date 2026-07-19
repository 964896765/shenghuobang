import type { AuthorizationRequest, PermissionAuditWriter } from "./types";
import { resourceIdDigest } from "./audit-writer";

const LEGACY_PERMISSION_MAP: Record<string, string> = {
  "platform.certification.review_initial": "verification.review",
  "platform.certification.review_final": "verification.review",
  "platform.complaint.investigate": "complaint.operate",
  "platform.complaint.decide": "complaint.decide",
  "platform.finance.review": "finance.refund.review",
  "platform.funds.execute": "finance.release",
  "platform.admin.menu": "admin.menu",
};

export interface LegacyObservation {
  hit: boolean;
  legacyPermission: string | null;
  grantsAuthorization: false;
  workspacePreference: string | null;
}

export class LegacyAuthorizationAdapter {
  constructor(private readonly audit: PermissionAuditWriter) {}

  async observe(request: AuthorizationRequest, legacy: { role?: string; currentRole?: string; workspacePreference?: string; permissions?: string[] }): Promise<LegacyObservation> {
    const compatibilityMarker = legacy.permissions?.find((item) => item.startsWith("compat:")) ?? null;
    const legacyPermission = compatibilityMarker ?? LEGACY_PERMISSION_MAP[request.capabilityCode] ?? null;
    const hit = Boolean(compatibilityMarker || (legacyPermission && legacy.permissions?.includes(legacyPermission)));
    if (hit || legacy.currentRole || legacy.workspacePreference) {
      await this.audit.write({
        requestId: request.requestId ?? null,
        accountId: request.accountId,
        capabilityCode: request.capabilityCode,
        decision: "changed",
        reasonCode: "LEGACY_COMPATIBILITY_OBSERVED",
        resourceType: request.resourceType ?? null,
        resourceIdDigest: resourceIdDigest(request.resourceType, request.resourceId),
        resolvedDataScope: null,
        fieldMask: [],
        policyVersion: "v3.3-a3.2",
        compatibilityHit: compatibilityMarker ?? (hit ? `users.role:${legacy.role ?? "unknown"}` : "user_profiles.currentRole"),
        detail: { legacyPermission: legacyPermission ?? "none", workspacePreferenceOnly: true, workspaceType: legacy.workspacePreference ?? "legacy_current_role" },
      });
    }
    return { hit, legacyPermission, grantsAuthorization: false, workspacePreference: legacy.currentRole ?? null };
  }
}
