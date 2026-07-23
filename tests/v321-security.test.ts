import { describe, expect, it } from "vitest";
import { readEnvironment, validateConfiguration } from "../server/_core/env";
import { checkReadiness } from "../server/_core/readiness";
import { detectFile, sanitizeFileName, validateMimeAndExtension } from "../server/storage/file-policy";
import { signFileAccess, verifyFileAccess, type FileAccessClaims } from "../server/storage/file-access-token";
import { isWebSocketOriginAllowed } from "../server/realtime";
import { notificationRetryDelayMs } from "../server/db";

const secret = "unit-test-file-signing-secret-at-least-32-chars";
function productionEnv(overrides: Record<string, string | undefined> = {}) {
  const base = { NODE_ENV: "production", DATABASE_URL: "mysql://test:test@127.0.0.1:3306/test", JWT_SECRET: "unit-test-jwt-secret-at-least-32-characters", FILE_SIGNING_SECRET: secret, CORS_ORIGINS: "https://app.example.test", STORAGE_PROVIDER: "local", LOCAL_UPLOAD_DIR: "./uploads-test" };
  return readEnvironment(Object.assign(base, overrides));
}

describe("V3.2.1 configuration and readiness", () => {
  it("accepts complete production configuration", () => {
    expect(validateConfiguration(productionEnv())).toEqual({ ok: true, missing: [], invalid: [] });
  });
  it("rejects missing production secrets and explicit CORS", () => {
    const result = validateConfiguration(productionEnv({ JWT_SECRET: "", FILE_SIGNING_SECRET: "", CORS_ORIGINS: "" }));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["JWT_SECRET", "FILE_SIGNING_SECRET", "CORS_ORIGINS"]));
  });
  it("reports S3 configuration gaps as not ready", async () => {
    const env = productionEnv({ STORAGE_PROVIDER: "s3", S3_ENDPOINT: "", S3_REGION: "", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "" });
    const result = await checkReadiness(env);
    expect(result.ok).toBe(false);
    expect(result.checks.configuration).toBe("failed");
  });
  it("reports an unwritable local target as not ready without leaking a path", async () => {
    const env = productionEnv({ LOCAL_UPLOAD_DIR: __filename });
    const result = await checkReadiness(env);
    expect(result.ok).toBe(false);
    expect(result.checks.storage).toBe("failed");
    expect(JSON.stringify(result)).not.toContain(__filename);
  });
});

describe("V3.2.1 notification retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect([1, 2, 3].map(notificationRetryDelayMs)).toEqual([30_000, 60_000, 120_000]);
    expect(notificationRetryDelayMs(20)).toBe(15 * 60_000);
  });
});

describe("V3.2.1 WebSocket origin policy", () => {
  it("allows only configured production origins", () => {
    const env = productionEnv();
    expect(isWebSocketOriginAllowed("https://app.example.test", env)).toBe(true);
    expect(isWebSocketOriginAllowed("https://evil.example.test", env)).toBe(false);
    expect(isWebSocketOriginAllowed(undefined, env)).toBe(false);
  });
  it("allows origin-less native clients only through explicit configuration", () => {
    expect(isWebSocketOriginAllowed(undefined, productionEnv({ WS_ALLOW_NATIVE_WITHOUT_ORIGIN: "true" }))).toBe(true);
  });
});

describe("V3.2.1 signed file access", () => {
  const claims: FileAccessClaims = { fileId: 7, userId: 11, expires: 2_000_000_000, purpose: "download", nonce: "123e4567-e89b-12d3-a456-426614174000", version: "a".repeat(16) };
  it("binds the signature to file, user, purpose, expiry, nonce and version", () => {
    const signature = signFileAccess(claims, secret);
    expect(verifyFileAccess(claims, signature, secret, 1_900_000_000_000)).toBe(true);
    expect(verifyFileAccess({ ...claims, userId: 12 }, signature, secret, 1_900_000_000_000)).toBe(false);
    expect(verifyFileAccess({ ...claims, purpose: "preview" }, signature, secret, 1_900_000_000_000)).toBe(false);
  });
  it("rejects expired and malformed signatures", () => {
    const signature = signFileAccess(claims, secret);
    expect(verifyFileAccess(claims, signature, secret, 2_100_000_000_000)).toBe(false);
    expect(verifyFileAccess(claims, "bad", secret, 1_900_000_000_000)).toBe(false);
  });
  it("accepts numeric policy versions used by stored files", () => {
    const numericClaims: FileAccessClaims = { ...claims, version: "1" };
    const signature = signFileAccess(numericClaims, secret);
    expect(verifyFileAccess(numericClaims, signature, secret, 1_900_000_000_000)).toBe(true);
  });
});

describe("V3.2.1 upload content validation", () => {
  const pdf = Buffer.from("%PDF-1.4\nunit\n");
  it("detects a PDF header and accepts a matching extension", () => {
    const detected = detectFile(pdf);
    expect(detected.mimeType).toBe("application/pdf");
    expect(validateMimeAndExtension("report.pdf", "application/pdf", detected)).toBe("pdf");
  });
  it("rejects MIME and extension mismatch", () => {
    expect(() => validateMimeAndExtension("report.png", "image/png", detectFile(pdf))).toThrow("文件内容与声明类型不匹配");
  });
  it("rejects traversal and control characters in file names", () => {
    expect(() => sanitizeFileName("../secret.pdf")).toThrow("非法文件名");
    expect(() => sanitizeFileName("bad\0name.pdf")).toThrow("非法文件名");
  });
});
