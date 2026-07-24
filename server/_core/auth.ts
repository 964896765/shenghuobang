import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME, SESSION_TTL_MS } from "../../shared/const.js";
import { HttpError } from "../../shared/_core/errors.js";
import * as db from "../db";
import { closeUserConnections } from "../realtime";
import { logger } from "./logger";
import { getSessionCookieOptions } from "./cookies";
import { assertAuthAttemptAllowed, recordAuthAttemptFailure, recordAuthAttemptSuccess } from "./auth-rate-limit";
import { hashPassword, verifyPassword } from "./password";
import { sdk } from "./sdk";

const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .regex(/^\+?[0-9]+$/, "手机号格式不正确");

const credentialsSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(8, "密码至少需要8位").max(128),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(32).optional(),
});

const logoutSchema = z.object({
  pushToken: z.string().min(8).max(512).optional(),
  deviceId: z.string().min(8).max(128).optional(),
}).optional();

function publicUser(user: NonNullable<Awaited<ReturnType<typeof db.getUserById>>>) {
  return {
    id: user.id,
    openId: user.openId,
    phone: user.phone,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
    accountStatus: user.accountStatus,
    lastSignedIn: user.lastSignedIn.toISOString(),
  };
}

async function createLoginResponse(req: Request, res: Response, user: NonNullable<Awaited<ReturnType<typeof db.getUserById>>>) {
  const sessionToken = await sdk.createSessionToken(user, {
    userAgent: req.headers["user-agent"],
    ip: req.ip || req.socket.remoteAddress,
  });
  res.cookie(COOKIE_NAME, sessionToken, {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_TTL_MS,
  });
  return { sessionToken, user: publicUser(user) };
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "注册信息不完整" });
      return;
    }

    try {
      assertAuthAttemptAllowed(req, "register", parsed.data.phone);
      const existing = await db.getUserByPhone(parsed.data.phone);
      if (existing) {
        recordAuthAttemptFailure(req, "register", parsed.data.phone);
        res.status(409).json({ error: "当前无法完成注册，请检查输入后重试" });
        return;
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const user = await db.createLocalUser({
        phone: parsed.data.phone,
        passwordHash,
        name: parsed.data.name,
      });
      if (!user) throw new Error("创建用户失败");
      recordAuthAttemptSuccess(req, "register", parsed.data.phone);
      res.status(201).json(await createLoginResponse(req, res, user));
    } catch (error) {
      if (error instanceof Error && error.name === "AuthRateLimitError") {
        res.status(429).json({ error: "请求过于频繁，请稍后再试" });
        return;
      }
      logger.error("auth.register_failed", { error, phone: parsed.data.phone });
      res.status(500).json({ error: "注册失败，请稍后重试" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "登录信息不完整" });
      return;
    }

    try {
      assertAuthAttemptAllowed(req, "login", parsed.data.phone);
      const user = await db.getUserByPhone(parsed.data.phone);
      if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        recordAuthAttemptFailure(req, "login", parsed.data.phone);
        res.status(401).json({ error: "登录失败，请检查手机号或密码" });
        return;
      }
      if (user.accountStatus !== "active" && user.accountStatus !== "restricted") {
        recordAuthAttemptFailure(req, "login", parsed.data.phone);
        res.status(403).json({ error: "账号当前不可登录" });
        return;
      }
      await db.touchUserSignedIn(user.id);
      const refreshedUser = (await db.getUserById(user.id)) ?? user;
      recordAuthAttemptSuccess(req, "login", parsed.data.phone);
      res.json(await createLoginResponse(req, res, refreshedUser));
    } catch (error) {
      if (error instanceof Error && error.name === "AuthRateLimitError") {
        res.status(429).json({ error: "请求过于频繁，请稍后再试" });
        return;
      }
      logger.error("auth.login_failed", { error, phone: parsed.data.phone });
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const user = await sdk.authenticateRequest(req).catch(() => undefined);
    if (user) {
      await sdk.revokeCurrentSession(req, "logout").catch(() => undefined);
      closeUserConnections(user.id, "Logged out");
      const device = logoutSchema.safeParse(req.body);
      if (device.success && device.data && (device.data.pushToken || device.data.deviceId)) {
        await db.deactivatePushToken(user.id, { token: device.data.pushToken, deviceId: device.data.deviceId }, "用户退出登录").catch(() => undefined);
      }
    }
    res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  app.post("/api/auth/logout-all", async (req, res) => {
    const user = await sdk.authenticateRequest(req).catch(() => undefined);
    if (user) {
      await sdk.revokeAllUserSessions(user.id, "logout_all");
      closeUserConnections(user.id, "Logged out everywhere");
    }
    res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: publicUser(user) });
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.statusCode)) {
        res.status(401).json({ error: "未登录", user: null });
        return;
      }
      logger.error("auth.session_lookup_failed", { error });
      res.status(503).json({ error: "认证服务暂时不可用，请稍后重试" });
    }
  });
}
