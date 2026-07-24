import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as db from "../server/db";
import { sdk } from "../server/_core/sdk";

const baseUser = {
  id: 7,
  openId: "local:13800000007",
  phone: "13800000007",
  passwordHash: "hash",
  email: null,
  name: "Demo User",
  loginMethod: "phone_password" as const,
  accountStatus: "active" as const,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

describe("session revocation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects revoked sessions", async () => {
    process.env.JWT_SECRET = "test-secret-with-more-than-24-characters";
    vi.spyOn(db, "createAuthSession").mockResolvedValueOnce(undefined);
    const token = await sdk.createSessionToken({ id: baseUser.id, openId: baseUser.openId, role: baseUser.role });
    const payload = await sdk.verifySession(token);
    vi.spyOn(db, "getAuthSessionBySessionId").mockResolvedValueOnce({
      id: 1,
      sessionId: payload!.sessionId,
      userId: baseUser.id,
      tokenHash: hashToken(token),
      deviceId: null,
      userAgent: null,
      ipDigest: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      revokeReason: "logout",
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await expect(sdk.authenticateRequest({
      headers: { authorization: `Bearer ${token}` },
      socket: {},
    } as never)).rejects.toThrow("Session revoked");
  });

  it("revokes all sessions when the account is suspended", async () => {
    process.env.JWT_SECRET = "test-secret-with-more-than-24-characters";
    vi.spyOn(db, "createAuthSession").mockResolvedValueOnce(undefined);
    const token = await sdk.createSessionToken({ id: baseUser.id, openId: baseUser.openId, role: baseUser.role });
    const payload = await sdk.verifySession(token);
    vi.spyOn(db, "getAuthSessionBySessionId").mockResolvedValueOnce({
      id: 1,
      sessionId: payload!.sessionId,
      userId: baseUser.id,
      tokenHash: hashToken(token),
      deviceId: null,
      userAgent: null,
      ipDigest: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      revokeReason: null,
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.spyOn(db, "getUserById").mockResolvedValueOnce({ ...baseUser, accountStatus: "suspended" } as never);
    const revokeAll = vi.spyOn(db, "revokeAllAuthSessionsForUser").mockResolvedValueOnce(undefined);

    await expect(sdk.authenticateRequest({
      headers: { authorization: `Bearer ${token}` },
      socket: {},
    } as never)).rejects.toThrow("Account is not available");
    expect(revokeAll).toHaveBeenCalledWith(baseUser.id, "account_unavailable");
  });
});
