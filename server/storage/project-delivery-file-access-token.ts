import crypto from "node:crypto";
import { ENV } from "../_core/env";

export interface ProjectDeliveryFileAccessClaims {
  accountId: number;
  projectId: number;
  designVersionId?: number;
  milestoneSubmissionId?: number;
  projectFileId: number;
  fileId: number;
  purpose: "download" | "preview";
  projectAuthorizationVersion: number;
  entityAuthorizationVersion: number;
  entityFileAccessPolicyVersion: number;
  projectFileAccessPolicyVersion: number;
  storedFileAccessPolicyVersion: number;
  expires: number;
  nonce: string;
}

function tokenKey(secret = ENV.fileSigningSecret): Buffer {
  if (secret.length < 24) throw new Error("FILE_SIGNING_SECRET_REQUIRED");
  return crypto.createHash("sha256").update(`project-delivery:${secret}`).digest();
}

function validClaims(claims: ProjectDeliveryFileAccessClaims, now = Date.now()) {
  return claims.accountId > 0 &&
    claims.projectId > 0 &&
    claims.projectFileId > 0 &&
    claims.fileId > 0 &&
    ["download", "preview"].includes(claims.purpose) &&
    claims.projectAuthorizationVersion > 0 &&
    claims.entityAuthorizationVersion > 0 &&
    claims.entityFileAccessPolicyVersion > 0 &&
    claims.projectFileAccessPolicyVersion > 0 &&
    claims.storedFileAccessPolicyVersion > 0 &&
    claims.expires >= Math.floor(now / 1000) &&
    /^[a-f0-9-]{16,64}$/i.test(claims.nonce) &&
    ((claims.designVersionId && !claims.milestoneSubmissionId) || (!claims.designVersionId && claims.milestoneSubmissionId));
}

export function createProjectDeliveryFileAccessToken(
  claims: ProjectDeliveryFileAccessClaims,
  secret = ENV.fileSigningSecret,
) {
  if (!validClaims(claims)) throw new Error("PROJECT_DELIVERY_FILE_ACCESS_INVALID");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(claims), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, encrypted, tag].map((part) => part.toString("base64url")).join(".");
}

export function parseProjectDeliveryFileAccessToken(
  token: string,
  secret = ENV.fileSigningSecret,
  now = Date.now(),
): ProjectDeliveryFileAccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, encrypted, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(secret), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const claims = JSON.parse(json) as ProjectDeliveryFileAccessClaims;
    return validClaims(claims, now) ? claims : null;
  } catch {
    return null;
  }
}
