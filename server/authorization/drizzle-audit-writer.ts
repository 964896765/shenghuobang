import { randomUUID } from "node:crypto";
import { permissionAuditEvents } from "../../drizzle/schema";
import { requireDb } from "../db";
import { assertSafeAuditDetail } from "./audit-writer";
import type { PermissionAuditEvent, PermissionAuditWriter } from "./types";

/** Persists only digests and sanitized policy metadata; raw resource identifiers stay out of contextData. */
export class DrizzlePermissionAuditWriter implements PermissionAuditWriter {
  async write(event: PermissionAuditEvent): Promise<void> {
    const detail = event.detail ?? {};
    assertSafeAuditDetail(detail);
    const db = await requireDb();
    await db.insert(permissionAuditEvents).values({
      eventId: randomUUID(),
      requestId: event.requestId,
      actorAccountId: event.accountId,
      actorType: "account",
      activeIdentityId: event.resolvedIdentityId ?? null,
      organizationId: event.resolvedOrganizationId ?? null,
      projectId: event.resolvedProjectId ?? null,
      platformStaffPositionId: event.resolvedPlatformStaffPositionId ?? null,
      capabilityCode: event.capabilityCode,
      resourceType: event.resourceType ?? "unspecified",
      resourceId: event.resourceIdDigest,
      decision: event.decision,
      reasonCode: event.reasonCode,
      resolvedDataScope: event.resolvedDataScope,
      confidentiality: event.confidentiality ?? null,
      fieldMask: { denied: event.fieldMask },
      policyVersion: event.policyVersion,
      contextData: { ...detail, compatibilityHit: event.compatibilityHit ?? null },
    });
  }
}
