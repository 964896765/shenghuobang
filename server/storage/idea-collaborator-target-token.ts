import crypto from "node:crypto";
import { ENV } from "../_core/env";
import type { IdeaRequestedRole } from "../services/idea-domain";

export interface IdeaCollaboratorTargetClaims {
  searcherAccountId: number;
  targetAccountId: number;
  targetIdentityId: number;
  requestedRole: IdeaRequestedRole;
  ideaId: number;
  identityStatus: string;
  identityVersion: number;
  certificationStatus: string;
  certificationVersion: number;
  expires: number;
  nonce: string;
}

export interface IdeaCollaboratorTargetScope {
  searcherAccountId: number;
  ideaId: number;
  requestedRole: IdeaRequestedRole;
}

export interface IdeaCollaboratorTargetState {
  identityStatus: string;
  identityVersion: number;
  certificationStatus: string;
  certificationVersion: number;
}

function tokenKey(secret = ENV.fileSigningSecret): Buffer {
  if (secret.length < 24) throw new Error("FILE_SIGNING_SECRET_REQUIRED");
  return crypto.createHash("sha256").update(`idea-collaborator:${secret}`).digest();
}

function validClaims(claims: IdeaCollaboratorTargetClaims, now = Date.now()): boolean {
  return [
    claims.searcherAccountId,
    claims.targetAccountId,
    claims.targetIdentityId,
    claims.ideaId,
    claims.identityVersion,
    claims.certificationVersion,
  ].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    claims.searcherAccountId > 0 &&
    claims.targetAccountId > 0 &&
    claims.targetIdentityId > 0 &&
    claims.ideaId > 0 &&
    ["designer", "engineer", "viewer"].includes(claims.requestedRole) &&
    typeof claims.identityStatus === "string" &&
    claims.identityStatus.length >= 1 &&
    claims.identityStatus.length <= 32 &&
    typeof claims.certificationStatus === "string" &&
    claims.certificationStatus.length >= 1 &&
    claims.certificationStatus.length <= 32 &&
    claims.expires >= Math.floor(now / 1000) &&
    /^[a-f0-9-]{16,64}$/i.test(claims.nonce);
}

export function createIdeaCollaboratorTargetToken(
  claims: IdeaCollaboratorTargetClaims,
  secret = ENV.fileSigningSecret,
): string {
  if (!validClaims(claims)) throw new Error("INVITATION_TARGET_INVALID");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(claims), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, encrypted, tag].map((part) => part.toString("base64url")).join(".");
}

export function parseIdeaCollaboratorTargetToken(
  token: string,
  secret = ENV.fileSigningSecret,
  now = Date.now(),
): IdeaCollaboratorTargetClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, encrypted, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(secret), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const claims = JSON.parse(json) as IdeaCollaboratorTargetClaims;
    return validClaims(claims, now) ? claims : null;
  } catch {
    return null;
  }
}

export function matchesIdeaCollaboratorTargetScope(
  claims: IdeaCollaboratorTargetClaims,
  scope: IdeaCollaboratorTargetScope,
): boolean {
  return claims.searcherAccountId === scope.searcherAccountId &&
    claims.ideaId === scope.ideaId &&
    claims.requestedRole === scope.requestedRole;
}

export function matchesIdeaCollaboratorTargetState(
  claims: IdeaCollaboratorTargetClaims,
  state: IdeaCollaboratorTargetState,
): boolean {
  return claims.identityStatus === state.identityStatus &&
    claims.identityVersion === state.identityVersion &&
    claims.certificationStatus === state.certificationStatus &&
    claims.certificationVersion === state.certificationVersion;
}
