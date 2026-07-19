import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  engineerProfiles,
  engineerVerifications,
  identityVerifications,
  merchantProfiles,
  merchantVerifications,
  userProfiles,
  verificationActions,
  verificationDocuments,
} from "../../drizzle/schema";
import { getProfile, requireDb } from "../db";
import { assertApprovedForBusiness } from "../domain/verification-policy";

export type VerificationType = "identity" | "engineer" | "merchant";
export type ReviewAction = "approve" | "request_info" | "reject";

function digest(value: string) {
  return crypto.createHash("sha256").update(value.trim().toUpperCase()).digest("hex");
}

function assertResubmittable(status: string) {
  if (!["additional_info_required", "rejected", "draft"].includes(status)) throw new Error("当前认证状态不能重新提交");
}

export async function submitIdentity(userId: number, input: { realName: string; idType: string; idNumber: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const latest = await tx.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(desc(identityVerifications.createdAt)).for("update").limit(1);
    if (latest[0]) {
      assertResubmittable(latest[0].status);
      await tx.update(identityVerifications).set({
        realName: input.realName, idType: input.idType, idNumberDigest: digest(input.idNumber), idNumberLast4: input.idNumber.slice(-4),
        status: "submitted", rejectReason: null, reviewedBy: null, reviewedAt: null, submittedAt: new Date(),
      }).where(eq(identityVerifications.id, latest[0].id));
      await tx.insert(verificationActions).values({ verificationType: "identity", verificationId: latest[0].id, actorId: userId, action: "resubmit", fromStatus: latest[0].status, toStatus: "submitted" });
      return latest[0].id;
    }
    const result = await tx.insert(identityVerifications).values({
      userId, realName: input.realName, idType: input.idType, idNumberDigest: digest(input.idNumber), idNumberLast4: input.idNumber.slice(-4), status: "submitted",
    });
    const id = Number(result[0].insertId);
    await tx.insert(verificationActions).values({ verificationType: "identity", verificationId: id, actorId: userId, action: "submit", toStatus: "submitted" });
    return id;
  });
}

export async function submitEngineer(userId: number, input: {
  realName: string; professionalTitle: string; primaryCategory: string; yearsOfExperience: number;
  introduction?: string; skills: string[]; startingPrice?: number; supportsRemote?: boolean; supportsOnsite?: boolean;
}) {
  const db = await requireDb();
  const profile = await getProfile(userId);
  return db.transaction(async (tx) => {
    const latest = await tx.select().from(engineerVerifications).where(eq(engineerVerifications.userId, userId)).orderBy(desc(engineerVerifications.createdAt)).for("update").limit(1);
    let verificationId: number;
    if (latest[0]) {
      assertResubmittable(latest[0].status);
      verificationId = latest[0].id;
      await tx.update(engineerVerifications).set({
        realName: input.realName, professionalTitle: input.professionalTitle, primaryCategory: input.primaryCategory,
        yearsOfExperience: input.yearsOfExperience, introduction: input.introduction, skills: input.skills,
        status: "submitted", rejectReason: null, reviewedBy: null, reviewedAt: null, submittedAt: new Date(),
      }).where(eq(engineerVerifications.id, verificationId));
      await tx.insert(verificationActions).values({ verificationType: "engineer", verificationId, actorId: userId, action: "resubmit", fromStatus: latest[0].status, toStatus: "submitted" });
    } else {
      const result = await tx.insert(engineerVerifications).values({
        userId, realName: input.realName, professionalTitle: input.professionalTitle, primaryCategory: input.primaryCategory,
        yearsOfExperience: input.yearsOfExperience, introduction: input.introduction, skills: input.skills, status: "submitted",
      });
      verificationId = Number(result[0].insertId);
      await tx.insert(verificationActions).values({ verificationType: "engineer", verificationId, actorId: userId, action: "submit", toStatus: "submitted" });
    }
    const existing = await tx.select().from(engineerProfiles).where(eq(engineerProfiles.userId, userId)).limit(1);
    const profileData = {
      realName: input.realName, professionalTitle: input.professionalTitle, primaryCategory: input.primaryCategory,
      yearsOfExperience: input.yearsOfExperience, introduction: input.introduction, skills: input.skills,
      startingPrice: input.startingPrice ?? 0, supportsRemote: input.supportsRemote ?? true, supportsOnsite: input.supportsOnsite ?? false,
      cityName: profile?.cityName ?? "北京", verificationLevel: "none" as const, acceptingOrders: false,
    };
    if (existing[0]) await tx.update(engineerProfiles).set(profileData).where(eq(engineerProfiles.userId, userId));
    else await tx.insert(engineerProfiles).values({ userId, ...profileData });
    await tx.update(userProfiles).set({ engineerStatus: "pending" }).where(eq(userProfiles.userId, userId));
    return verificationId;
  });
}

export async function submitMerchant(userId: number, input: {
  merchantName: string; registrationNo?: string; categories: string[]; description?: string; addressText?: string;
}) {
  const db = await requireDb();
  const profile = await getProfile(userId);
  return db.transaction(async (tx) => {
    const latest = await tx.select().from(merchantVerifications).where(eq(merchantVerifications.userId, userId)).orderBy(desc(merchantVerifications.createdAt)).for("update").limit(1);
    const registrationNoDigest = input.registrationNo ? digest(input.registrationNo) : null;
    const registrationNoLast4 = input.registrationNo?.slice(-4) ?? null;
    let verificationId: number;
    if (latest[0]) {
      assertResubmittable(latest[0].status);
      verificationId = latest[0].id;
      await tx.update(merchantVerifications).set({
        merchantName: input.merchantName, registrationNoDigest, registrationNoLast4, categories: input.categories,
        description: input.description, addressText: input.addressText, status: "submitted", rejectReason: null,
        reviewedBy: null, reviewedAt: null, submittedAt: new Date(),
      }).where(eq(merchantVerifications.id, verificationId));
      await tx.insert(verificationActions).values({ verificationType: "merchant", verificationId, actorId: userId, action: "resubmit", fromStatus: latest[0].status, toStatus: "submitted" });
    } else {
      const result = await tx.insert(merchantVerifications).values({
        userId, merchantName: input.merchantName, registrationNoDigest, registrationNoLast4, categories: input.categories,
        description: input.description, addressText: input.addressText, status: "submitted",
      });
      verificationId = Number(result[0].insertId);
      await tx.insert(verificationActions).values({ verificationType: "merchant", verificationId, actorId: userId, action: "submit", toStatus: "submitted" });
    }
    const existing = await tx.select().from(merchantProfiles).where(eq(merchantProfiles.userId, userId)).limit(1);
    const profileData = {
      name: input.merchantName, categories: input.categories, description: input.description, addressText: input.addressText,
      cityName: profile?.cityName ?? "北京", acceptingOrders: false,
    };
    if (existing[0]) await tx.update(merchantProfiles).set(profileData).where(eq(merchantProfiles.userId, userId));
    else await tx.insert(merchantProfiles).values({ userId, ...profileData });
    await tx.update(userProfiles).set({ merchantStatus: "pending" }).where(eq(userProfiles.userId, userId));
    return verificationId;
  });
}

export async function myVerifications(userId: number) {
  const db = await requireDb();
  const [identity, engineer, merchant] = await Promise.all([
    db.select().from(identityVerifications).where(eq(identityVerifications.userId, userId)).orderBy(desc(identityVerifications.createdAt)).limit(1),
    db.select().from(engineerVerifications).where(eq(engineerVerifications.userId, userId)).orderBy(desc(engineerVerifications.createdAt)).limit(1),
    db.select().from(merchantVerifications).where(eq(merchantVerifications.userId, userId)).orderBy(desc(merchantVerifications.createdAt)).limit(1),
  ]);
  return { identity: identity[0] ?? null, engineer: engineer[0] ?? null, merchant: merchant[0] ?? null };
}

async function ownerFor(type: VerificationType, verificationId: number) {
  const db = await requireDb();
  if (type === "identity") return (await db.select().from(identityVerifications).where(eq(identityVerifications.id, verificationId)).limit(1))[0]?.userId;
  if (type === "engineer") return (await db.select().from(engineerVerifications).where(eq(engineerVerifications.id, verificationId)).limit(1))[0]?.userId;
  return (await db.select().from(merchantVerifications).where(eq(merchantVerifications.id, verificationId)).limit(1))[0]?.userId;
}

export async function addVerificationDocument(input: {
  verificationType: VerificationType; verificationId: number; ownerId: number; documentType: string;
  fileName: string; storageKey: string; mimeType?: string; sizeBytes: number;
}) {
  const ownerId = await ownerFor(input.verificationType, input.verificationId);
  if (!ownerId || ownerId !== input.ownerId) throw new Error("无权为该认证上传资料");
  const db = await requireDb();
  const result = await db.insert(verificationDocuments).values(input);
  return Number(result[0].insertId);
}

export async function getVerificationDocument(documentId: number) {
  const db = await requireDb();
  return (await db.select().from(verificationDocuments).where(eq(verificationDocuments.id, documentId)).limit(1))[0];
}

export async function listVerificationDocuments(type: VerificationType, verificationId: number) {
  const db = await requireDb();
  return db.select().from(verificationDocuments).where(and(
    eq(verificationDocuments.verificationType, type), eq(verificationDocuments.verificationId, verificationId), eq(verificationDocuments.status, "available"),
  )).orderBy(desc(verificationDocuments.createdAt));
}

export async function assertEngineerApproved(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(engineerVerifications).where(and(eq(engineerVerifications.userId, userId), eq(engineerVerifications.status, "approved"))).limit(1);
  assertApprovedForBusiness(rows[0]?.status, "engineer_quote");
}

export async function assertMerchantApproved(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(merchantVerifications).where(and(eq(merchantVerifications.userId, userId), eq(merchantVerifications.status, "approved"))).limit(1);
  assertApprovedForBusiness(rows[0]?.status, "merchant_recycling_quote");
}

export async function listPendingVerifications() {
  const db = await requireDb();
  const statuses = ["submitted", "under_review", "additional_info_required"] as const;
  const [identity, engineer, merchant] = await Promise.all([
    db.select().from(identityVerifications).where(inArray(identityVerifications.status, statuses)).orderBy(identityVerifications.submittedAt),
    db.select().from(engineerVerifications).where(inArray(engineerVerifications.status, statuses)).orderBy(engineerVerifications.submittedAt),
    db.select().from(merchantVerifications).where(inArray(merchantVerifications.status, statuses)).orderBy(merchantVerifications.submittedAt),
  ]);
  return {
    items: [
      ...identity.map((item) => ({ type: "identity" as const, item })),
      ...engineer.map((item) => ({ type: "engineer" as const, item })),
      ...merchant.map((item) => ({ type: "merchant" as const, item })),
    ],
  };
}

export async function verificationDetail(type: VerificationType, id: number) {
  const db = await requireDb();
  const record = type === "identity"
    ? (await db.select().from(identityVerifications).where(eq(identityVerifications.id, id)).limit(1))[0]
    : type === "engineer"
      ? (await db.select().from(engineerVerifications).where(eq(engineerVerifications.id, id)).limit(1))[0]
      : (await db.select().from(merchantVerifications).where(eq(merchantVerifications.id, id)).limit(1))[0];
  if (!record) throw new Error("认证申请不存在");
  const [documents, actions] = await Promise.all([
    listVerificationDocuments(type, id),
    db.select().from(verificationActions).where(and(eq(verificationActions.verificationType, type), eq(verificationActions.verificationId, id))).orderBy(desc(verificationActions.createdAt)),
  ]);
  return { record, documents: documents.map(({ storageKey: _storageKey, ...document }) => document), actions };
}

function nextReviewStatus(action: ReviewAction) {
  return action === "approve" ? "approved" as const : action === "request_info" ? "additional_info_required" as const : "rejected" as const;
}

export async function reviewVerification(type: VerificationType, id: number, reviewerId: number, action: ReviewAction, reason?: string) {
  if (action !== "approve" && !reason?.trim()) throw new Error("退回或拒绝必须填写审核原因");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const now = new Date();
    const toStatus = nextReviewStatus(action);
    if (type === "identity") {
      const rows = await tx.select().from(identityVerifications).where(eq(identityVerifications.id, id)).for("update").limit(1);
      const item = rows[0];
      if (!item || !["submitted", "under_review", "additional_info_required"].includes(item.status)) throw new Error("当前认证状态不能审核");
      await tx.update(identityVerifications).set({ status: toStatus, rejectReason: action === "approve" ? null : reason, reviewedBy: reviewerId, reviewedAt: now }).where(eq(identityVerifications.id, id));
      await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action, fromStatus: item.status, toStatus, reason });
      return { userId: item.userId, status: toStatus };
    }
    if (type === "engineer") {
      const rows = await tx.select().from(engineerVerifications).where(eq(engineerVerifications.id, id)).for("update").limit(1);
      const item = rows[0];
      if (!item || !["submitted", "under_review", "additional_info_required"].includes(item.status)) throw new Error("当前认证状态不能审核");
      await tx.update(engineerVerifications).set({ status: toStatus, rejectReason: action === "approve" ? null : reason, reviewedBy: reviewerId, reviewedAt: now }).where(eq(engineerVerifications.id, id));
      await tx.update(userProfiles).set({ engineerStatus: action === "approve" ? "active" : action === "request_info" ? "pending" : "rejected" }).where(eq(userProfiles.userId, item.userId));
      await tx.update(engineerProfiles).set({ verificationLevel: action === "approve" ? "basic" : "none", acceptingOrders: action === "approve" }).where(eq(engineerProfiles.userId, item.userId));
      await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action, fromStatus: item.status, toStatus, reason });
      return { userId: item.userId, status: toStatus };
    }
    const rows = await tx.select().from(merchantVerifications).where(eq(merchantVerifications.id, id)).for("update").limit(1);
    const item = rows[0];
    if (!item || !["submitted", "under_review", "additional_info_required"].includes(item.status)) throw new Error("当前认证状态不能审核");
    await tx.update(merchantVerifications).set({ status: toStatus, rejectReason: action === "approve" ? null : reason, reviewedBy: reviewerId, reviewedAt: now }).where(eq(merchantVerifications.id, id));
    await tx.update(userProfiles).set({ merchantStatus: action === "approve" ? "active" : action === "request_info" ? "pending" : "rejected" }).where(eq(userProfiles.userId, item.userId));
    await tx.update(merchantProfiles).set({ acceptingOrders: action === "approve" }).where(eq(merchantProfiles.userId, item.userId));
    await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action, fromStatus: item.status, toStatus, reason });
    return { userId: item.userId, status: toStatus };
  });
}

export async function revokeVerification(type: VerificationType, id: number, reviewerId: number, reason: string) {
  if (!reason.trim()) throw new Error("撤销认证必须填写原因");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    if (type === "identity") {
      const item = (await tx.select().from(identityVerifications).where(eq(identityVerifications.id, id)).for("update").limit(1))[0];
      if (!item || item.status !== "approved") throw new Error("只有已通过认证可以撤销");
      await tx.update(identityVerifications).set({ status: "revoked", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(identityVerifications.id, id));
      await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action: "revoke", fromStatus: item.status, toStatus: "revoked", reason });
      return item.userId;
    }
    if (type === "engineer") {
      const item = (await tx.select().from(engineerVerifications).where(eq(engineerVerifications.id, id)).for("update").limit(1))[0];
      if (!item || item.status !== "approved") throw new Error("只有已通过认证可以撤销");
      await tx.update(engineerVerifications).set({ status: "revoked", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(engineerVerifications.id, id));
      await tx.update(userProfiles).set({ engineerStatus: "none", currentRole: "user" }).where(eq(userProfiles.userId, item.userId));
      await tx.update(engineerProfiles).set({ verificationLevel: "none", acceptingOrders: false }).where(eq(engineerProfiles.userId, item.userId));
      await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action: "revoke", fromStatus: item.status, toStatus: "revoked", reason });
      return item.userId;
    }
    const item = (await tx.select().from(merchantVerifications).where(eq(merchantVerifications.id, id)).for("update").limit(1))[0];
    if (!item || item.status !== "approved") throw new Error("只有已通过认证可以撤销");
    await tx.update(merchantVerifications).set({ status: "revoked", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(merchantVerifications.id, id));
    await tx.update(userProfiles).set({ merchantStatus: "none", currentRole: "user" }).where(eq(userProfiles.userId, item.userId));
    await tx.update(merchantProfiles).set({ acceptingOrders: false }).where(eq(merchantProfiles.userId, item.userId));
    await tx.insert(verificationActions).values({ verificationType: type, verificationId: id, actorId: reviewerId, action: "revoke", fromStatus: item.status, toStatus: "revoked", reason });
    return item.userId;
  });
}
