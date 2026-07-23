import crypto from "node:crypto";
import { ENV } from "../_core/env";

export type IdeaFileAccessPurpose = "download" | "preview";

export interface IdeaFileAccessClaims {
  accountId: number;
  ideaId: number;
  attachmentId: number;
  fileId: number;
  purpose: IdeaFileAccessPurpose;
  ideaAuthorizationVersion: number;
  attachmentPolicyVersion: number;
  storedFilePolicyVersion: number;
  expires: number;
  nonce: string;
  requestId: string;
}

function canonical(claims: IdeaFileAccessClaims): string {
  return [
    claims.accountId,
    claims.ideaId,
    claims.attachmentId,
    claims.fileId,
    claims.purpose,
    claims.ideaAuthorizationVersion,
    claims.attachmentPolicyVersion,
    claims.storedFilePolicyVersion,
    claims.expires,
    claims.nonce,
    claims.requestId,
  ].join(":");
}

function validClaims(claims: IdeaFileAccessClaims, now: number): boolean {
  return [claims.accountId, claims.ideaId, claims.attachmentId, claims.fileId].every((value) => Number.isSafeInteger(value) && value > 0) &&
    [claims.ideaAuthorizationVersion, claims.attachmentPolicyVersion, claims.storedFilePolicyVersion].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    claims.expires >= Math.floor(now / 1000) &&
    ["download", "preview"].includes(claims.purpose) &&
    /^[a-f0-9-]{16,64}$/i.test(claims.nonce) &&
    /^[A-Za-z0-9._:-]{1,64}$/.test(claims.requestId);
}

export function signIdeaFileAccess(claims: IdeaFileAccessClaims, secret = ENV.fileSigningSecret): string {
  if (secret.length < 24) throw new Error("FILE_SIGNING_SECRET_REQUIRED");
  return crypto.createHmac("sha256", secret).update(canonical(claims)).digest("hex");
}

export function verifyIdeaFileAccess(
  claims: IdeaFileAccessClaims,
  signature: string,
  secret = ENV.fileSigningSecret,
  now = Date.now(),
): boolean {
  if (!validClaims(claims, now) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  try {
    const expected = Buffer.from(signIdeaFileAccess(claims, secret), "hex");
    const actual = Buffer.from(signature, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
