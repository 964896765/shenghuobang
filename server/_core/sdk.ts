import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  userId: number;
  openId: string;
  role: "user" | "admin";
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

  async createSessionToken(user: Pick<User, "id" | "openId" | "role">, expiresInMs = ONE_YEAR_MS) {
    const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
    return new SignJWT({
      userId: user.id,
      openId: user.openId,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setSubject(String(user.id))
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
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
      if (!Number.isInteger(userId) || userId <= 0 || !openId) return null;
      return { userId, openId, role };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token: string | undefined;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    }
    if (!token) {
      token = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    }

    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Invalid or expired session");

    const user = await db.getUserById(session.userId);
    if (!user || user.openId !== session.openId) {
      throw ForbiddenError("User not found");
    }
    if (user.accountStatus === "suspended" || user.accountStatus === "closed") {
      throw ForbiddenError("Account is not available");
    }
    return user;
  }
}

export const sdk = new LocalAuthSDK();
