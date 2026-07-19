import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  businessIdentities,
  certificationDocuments,
  certificationReviewActions,
  certifications,
  certificationTypes,
  identityProfiles,
  identityTypes,
  storedFiles,
  userProfiles,
  users,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import {
  ACTIVE_CERTIFICATION_STATUSES,
  CLIENT_SAFE_CERTIFICATION_FIELDS,
  certificationDedupeKey,
  normalizeRequestId,
  redactCertificationApplication,
  type CertificationKind,
  type IdentityKind,
} from "./identity-organization-domain";

export interface IdentityProfileInput {
  displayName?: string;
  professionalTitle?: string;
  introduction?: string;
  skills?: string[];
  cityCode?: string;
  cityName?: string;
  profileData?: Record<string, unknown>;
}

export interface CertificationSubmission {
  identityKind: IdentityKind;
  certificationKind: CertificationKind;
  profile: IdentityProfileInput;
  application: Record<string, unknown>;
  requestId?: string | null;
}

export async function updateAccountAndPublicProfile(accountId: number, input: {
  accountName?: string;
  nickname?: string;
  bio?: string;
  cityName?: string;
}): Promise<void> {
  const db = await requireDb();
  await db.transaction(async (tx) => {
    if (input.accountName !== undefined) await tx.update(users).set({ name: input.accountName }).where(eq(users.id, accountId));
    await tx.insert(userProfiles).values({
      userId: accountId,
      nickname: input.nickname ?? input.accountName,
      bio: input.bio,
      cityName: input.cityName,
    }).onDuplicateKeyUpdate({ set: {
      ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.cityName !== undefined ? { cityName: input.cityName } : {}),
      updatedAt: sql`${userProfiles.updatedAt}`,
    } });
  });
}

export async function listMyIdentities(accountId: number) {
  const db = await requireDb();
  return db.select({
    id: businessIdentities.id,
    accountId: businessIdentities.accountId,
    typeCode: identityTypes.code,
    typeName: identityTypes.name,
    requiresCertification: identityTypes.requiresCertification,
    status: businessIdentities.status,
    source: businessIdentities.source,
    displayName: identityProfiles.displayName,
    professionalTitle: identityProfiles.professionalTitle,
    introduction: identityProfiles.introduction,
    skills: identityProfiles.skills,
    cityName: identityProfiles.cityName,
    profileData: identityProfiles.profileData,
    version: businessIdentities.version,
    createdAt: businessIdentities.createdAt,
  }).from(businessIdentities)
    .innerJoin(identityTypes, eq(identityTypes.id, businessIdentities.identityTypeId))
    .leftJoin(identityProfiles, and(eq(identityProfiles.identityId, businessIdentities.id), isNull(identityProfiles.deletedAt)))
    .where(and(eq(businessIdentities.accountId, accountId), isNull(identityTypes.deletedAt)))
    .orderBy(businessIdentities.id);
}

export async function getMyIdentity(accountId: number, identityId: number) {
  return (await listMyIdentities(accountId)).find((row) => row.id === identityId) ?? null;
}

export async function ensureBusinessIdentity(accountId: number, kind: IdentityKind, profile?: IdentityProfileInput) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [type] = await tx.select().from(identityTypes).where(and(
      eq(identityTypes.code, kind), eq(identityTypes.status, "active"), isNull(identityTypes.deletedAt),
    )).limit(1);
    if (!type) throw new Error("IDENTITY_TYPE_INACTIVE");

    await tx.insert(businessIdentities).values({
      accountId,
      identityTypeId: type.id,
      status: "active",
      source: "self_service",
      createdBy: accountId,
    }).onDuplicateKeyUpdate({ set: { updatedAt: sql`${businessIdentities.updatedAt}` } });

    const [identity] = await tx.select().from(businessIdentities).where(and(
      eq(businessIdentities.accountId, accountId), eq(businessIdentities.identityTypeId, type.id),
    )).for("update").limit(1);
    if (!identity || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");

    if (profile) {
      await tx.insert(identityProfiles).values({ identityId: identity.id, ...profile })
        .onDuplicateKeyUpdate({ set: {
          ...profile,
          version: sql`${identityProfiles.version} + 1`,
          deletedAt: null,
        } });
    }
    return { ...identity, typeCode: type.code, requiresCertification: type.requiresCertification };
  });
}

export async function updateMyIdentityProfile(accountId: number, identityId: number, profile: IdentityProfileInput) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [identity] = await tx.select().from(businessIdentities).where(and(
      eq(businessIdentities.id, identityId), eq(businessIdentities.accountId, accountId),
    )).for("update").limit(1);
    if (!identity || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
    await tx.insert(identityProfiles).values({ identityId, ...profile }).onDuplicateKeyUpdate({ set: {
      ...profile,
      version: sql`${identityProfiles.version} + 1`,
      deletedAt: null,
    } });
    return identity;
  });
}

export async function suspendMyIdentity(accountId: number, identityId: number, reason?: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [identity] = await tx.select().from(businessIdentities).where(and(
      eq(businessIdentities.id, identityId), eq(businessIdentities.accountId, accountId),
    )).for("update").limit(1);
    if (!identity || identity.status !== "active") throw new Error("IDENTITY_INACTIVE");
    const [type] = await tx.select({ code: identityTypes.code }).from(identityTypes).where(eq(identityTypes.id, identity.identityTypeId)).limit(1);
    if (type?.code === "consumer") throw new Error("RESOURCE_STATE_FORBIDDEN");
    await tx.update(businessIdentities).set({
      status: "suspended",
      suspendedAt: new Date(),
      suspendedBy: accountId,
      suspensionReason: reason?.slice(0, 500) || "self_suspended",
      version: identity.version + 1,
    }).where(and(eq(businessIdentities.id, identityId), eq(businessIdentities.version, identity.version)));
    return { id: identityId, status: "suspended" as const };
  });
}

export async function submitIdentityCertification(accountId: number, input: CertificationSubmission) {
  const identity = await ensureBusinessIdentity(accountId, input.identityKind, input.profile);
  const db = await requireDb();
  const requestId = normalizeRequestId(input.requestId);
  return db.transaction(async (tx) => {
    const [type] = await tx.select().from(certificationTypes).where(and(
      eq(certificationTypes.code, input.certificationKind), eq(certificationTypes.status, "active"), isNull(certificationTypes.deletedAt),
    )).limit(1);
    if (!type) throw new Error("CERTIFICATION_TYPE_INACTIVE");
    const dedupe = certificationDedupeKey(identity.id, type.id);
    const [open] = await tx.select().from(certifications).where(eq(certifications.activeDedupeKey, dedupe)).for("update").limit(1);
    const safeApplication = redactCertificationApplication(input.certificationKind, input.application);
    const now = new Date();

    if (open) {
      if (!ACTIVE_CERTIFICATION_STATUSES.has(open.status)) throw new Error("CONCURRENT_MODIFICATION");
      if (open.status === "approved" || open.status === "pending") return { identityId: identity.id, certificationId: open.id, status: open.status, reused: true };
      await tx.update(certifications).set({
        status: "pending",
        applicationData: safeApplication,
        submittedAt: now,
        decisionReasonCode: null,
        decisionReason: null,
        version: open.version + 1,
      }).where(and(eq(certifications.id, open.id), eq(certifications.version, open.version)));
      await tx.insert(certificationReviewActions).values({
        certificationId: open.id, stage: "submission", action: "resubmit", fromStatus: open.status,
        toStatus: "pending", actorId: accountId, requestId,
      }).onDuplicateKeyUpdate({ set: { requestId: sql`${certificationReviewActions.requestId}` } });
      return { identityId: identity.id, certificationId: open.id, status: "pending" as const, reused: true };
    }

    const applicationNo = `APP-${crypto.randomUUID()}`;
    const result = await tx.insert(certifications).values({
      applicationNo,
      certificationTypeId: type.id,
      subjectIdentityId: identity.id,
      status: "pending",
      applicationData: safeApplication,
      activeDedupeKey: dedupe,
      submittedAt: now,
    });
    const certificationId = Number(result[0].insertId);
    await tx.insert(certificationReviewActions).values({
      certificationId, stage: "submission", action: "submit", toStatus: "pending", actorId: accountId, requestId,
    });
    return { identityId: identity.id, certificationId, status: "pending" as const, reused: false };
  });
}

export async function listMyCertifications(accountId: number) {
  const db = await requireDb();
  const rows = await db.select({
    id: certifications.id,
    applicationNo: certifications.applicationNo,
    certificationTypeId: certifications.certificationTypeId,
    typeCode: certificationTypes.code,
    typeName: certificationTypes.name,
    subjectIdentityId: certifications.subjectIdentityId,
    subjectOrganizationId: certifications.subjectOrganizationId,
    status: certifications.status,
    submittedAt: certifications.submittedAt,
    approvedAt: certifications.approvedAt,
    expiresAt: certifications.expiresAt,
    revokedAt: certifications.revokedAt,
    decisionReasonCode: certifications.decisionReasonCode,
    createdAt: certifications.createdAt,
    updatedAt: certifications.updatedAt,
  }).from(certifications)
    .innerJoin(certificationTypes, eq(certificationTypes.id, certifications.certificationTypeId))
    .innerJoin(businessIdentities, eq(businessIdentities.id, certifications.subjectIdentityId))
    .where(eq(businessIdentities.accountId, accountId))
    .orderBy(desc(certifications.createdAt));
  return rows;
}

export function clientSafeCertification(record: Record<string, unknown>) {
  return Object.fromEntries(CLIENT_SAFE_CERTIFICATION_FIELDS.flatMap((key) => key in record ? [[key, record[key]]] : []));
}

export async function attachCertificationDocument(accountId: number, certificationId: number, fileId: number, documentType: string) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: certifications.id }).from(certifications)
      .innerJoin(businessIdentities, eq(businessIdentities.id, certifications.subjectIdentityId))
      .where(and(eq(certifications.id, certificationId), eq(businessIdentities.accountId, accountId))).for("update").limit(1);
    const [file] = await tx.select().from(storedFiles).where(and(eq(storedFiles.id, fileId), eq(storedFiles.ownerId, accountId), eq(storedFiles.status, "available"))).limit(1);
    if (!owned || !file) throw new Error("RESOURCE_RELATION_REQUIRED");
    const [latest] = await tx.select({ versionNo: certificationDocuments.versionNo }).from(certificationDocuments)
      .where(and(eq(certificationDocuments.certificationId, certificationId), eq(certificationDocuments.documentType, documentType)))
      .orderBy(desc(certificationDocuments.versionNo)).for("update").limit(1);
    const versionNo = (latest?.versionNo ?? 0) + 1;
    await tx.update(certificationDocuments).set({ status: "superseded" }).where(and(
      eq(certificationDocuments.certificationId, certificationId), eq(certificationDocuments.documentType, documentType), eq(certificationDocuments.status, "available"),
    ));
    const inserted = await tx.insert(certificationDocuments).values({ certificationId, fileId, documentType, versionNo, status: "available", uploadedBy: accountId });
    return { id: Number(inserted[0].insertId), certificationId, fileId, documentType, versionNo, status: "available" as const };
  });
}

export async function listMyCertificationDocuments(accountId: number, certificationId: number) {
  const db = await requireDb();
  return db.select({
    id: certificationDocuments.id,
    certificationId: certificationDocuments.certificationId,
    fileId: certificationDocuments.fileId,
    documentType: certificationDocuments.documentType,
    versionNo: certificationDocuments.versionNo,
    status: certificationDocuments.status,
    createdAt: certificationDocuments.createdAt,
  }).from(certificationDocuments)
    .innerJoin(certifications, eq(certifications.id, certificationDocuments.certificationId))
    .innerJoin(businessIdentities, eq(businessIdentities.id, certifications.subjectIdentityId))
    .where(and(eq(certificationDocuments.certificationId, certificationId), eq(businessIdentities.accountId, accountId)));
}
