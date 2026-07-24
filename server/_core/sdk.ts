import { createHash, randomUUID } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, SESSION_TTL_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  userId: number;
  openId: string;
  role: "user" | "admin";
  sessionId: string;
};

class LocalAuthSDK {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    const secret = process.env.JWT_SECRET ?? ENV.cookieSecret;
    if (!secret || secret.length < 24) {
      throw new Error("JWT_SECRET must be configured and contain at least 24 characters");
    }
    return new TextEncoder().encode(secret);
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private digestValue(value: string | null | undefined) {
    if (!value) return null;
    return createHash("sha256").update(value).digest("hex");
  }

  extractRequestToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice("Bearer ".length).trim();
    }
    return this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
  }

  async createSessionToken(
    user: Pick<User, "id" | "openId" | "role">,
    options: {
      expiresInMs?: number;
      deviceId?: string | null;
      userAgent?: string | null;
      ip?: string | null;
    } = {},
  ) {
    const expiresInMs = options.expiresInMs ?? SESSION_TTL_MS;
    const expiresAt = new Date(Date.now() + expiresInMs);
    const expirationSeconds = Math.floor(expiresAt.getTime() / 1000);
    const sessionId = randomUUID().replaceAll("-", "");
    const token = await new SignJWT({
      userId: user.id,
      openId: user.openId,
      role: user.role,
      sessionId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setJti(sessionId)
      .setSubject(String(user.id))
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
    await db.createAuthSession({
      sessionId,
      userId: user.id,
      tokenHash: this.hashToken(token),
      expiresAt,
      deviceId: options.deviceId ?? null,
      userAgent: options.userAgent ?? null,
      ipDigest: this.digestValue(options.ip ?? null),
    });
    return token;
  }

  async verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const userId = Number(payload.userId ?? payload.sub);
      const openId = typeof payload.openId === "string" ? payload.openId : "";
      const role = payload.role === "admin" ? "admin" : "user";
      const sessionId = typeof payload.sessionId === "string"
        ? payload.sessionId
        : typeof payload.jti === "string"
          ? payload.jti
          : "";
      if (!Number.isInteger(userId) || userId <= 0 || !openId || !sessionId) return null;
      return { userId, openId, role, sessionId };
    } catch {
      return null;
    }
  }

  async revokeCurrentSession(req: Request, reason = "logout") {
    const token = this.extractRequestToken(req);
    const session = await this.verifySession(token);
    if (!session) return;
    await db.revokeAuthSession(session.sessionId, reason);
  }

  async revokeAllUserSessions(userId: number, reason = "logout_all", exceptSessionId?: string | null) {
    await db.revokeAllAuthSessionsForUser(userId, reason, exceptSessionId ?? null);
  }

  async authenticateRequest(req: Request): Promise<User> {
    const token = this.extractRequestToken(req);
    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Invalid or expired session");
    const persisted = await db.getAuthSessionBySessionId(session.sessionId);
    if (!persisted) throw ForbiddenError("Session not found");
    if (persisted.tokenHash !== this.hashToken(token ?? "")) throw ForbiddenError("Session token mismatch");
    if (persisted.revokedAt) throw ForbiddenError("Session revoked");
    if (persisted.expiresAt.getTime() <= Date.now()) throw ForbiddenError("Session expired");

    const user = await db.getUserById(session.userId);
    if (!user || user.openId !== session.openId) {
      throw ForbiddenError("User not found");
    }
    if (user.accountStatus === "suspended" || user.accountStatus === "closed") {
      await db.revokeAllAuthSessionsForUser(session.userId, "account_unavailable");
      throw ForbiddenError("Account is not available");
    }
    await db.touchAuthSessionSeen(session.sessionId);
    return user;
  }
}

export const sdk = new LocalAuthSDK();
