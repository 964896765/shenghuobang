import crypto from "node:crypto";
import { ENV } from "../_core/env";

export type FileAccessClaims = { fileId: number; userId: number; expires: number; purpose: "download" | "preview"; nonce: string; version: string };

function canonical(claims: FileAccessClaims) {
  return [claims.fileId, claims.userId, claims.expires, claims.purpose, claims.nonce, claims.version].join(":");
}

export function signFileAccess(claims: FileAccessClaims, secret = ENV.fileSigningSecret) {
  if (secret.length < 24) throw new Error("FILE_SIGNING_SECRET 未配置或强度不足");
  return crypto.createHmac("sha256", secret).update(canonical(claims)).digest("hex");
}

export function verifyFileAccess(claims: FileAccessClaims, signature: string, secret = ENV.fileSigningSecret, now = Date.now()) {
  if (!Number.isSafeInteger(claims.fileId) || !Number.isSafeInteger(claims.userId) || claims.expires < Math.floor(now / 1000)) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature) || !/^[a-f0-9-]{16,64}$/i.test(claims.nonce) || !/^[A-Za-z0-9._-]{1,64}$/.test(claims.version)) return false;
  try {
    const expected = Buffer.from(signFileAccess(claims, secret), "hex");
    const actual = Buffer.from(signature, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
