import type { Request } from "express";

type CounterState = {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lockedUntil: number;
};

type Scope = "login:ip" | "login:phone" | "register:ip" | "register:phone";

const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_RECORDS = 5_000;
const LIMITS: Record<Scope, number> = {
  "login:ip": 12,
  "login:phone": 5,
  "register:ip": 8,
  "register:phone": 3,
};

class InMemoryAuthRateLimiter {
  private readonly states = new Map<string, CounterState>();

  reset() {
    this.states.clear();
  }

  private cleanup(now: number) {
    for (const [key, value] of this.states) {
      if (value.lockedUntil <= now && value.lastAttemptAt + WINDOW_MS < now) {
        this.states.delete(key);
      }
    }
    while (this.states.size > MAX_RECORDS) {
      const oldest = [...this.states.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt)[0]?.[0];
      if (!oldest) break;
      this.states.delete(oldest);
    }
  }

  private getState(scope: Scope, key: string, now: number) {
    this.cleanup(now);
    const mapKey = `${scope}:${key}`;
    const current = this.states.get(mapKey);
    if (!current) return { mapKey, state: null };
    if (current.lockedUntil <= now && current.firstAttemptAt + WINDOW_MS < now) {
      this.states.delete(mapKey);
      return { mapKey, state: null };
    }
    if (current.lockedUntil <= now && current.firstAttemptAt + WINDOW_MS <= now) {
      this.states.delete(mapKey);
      return { mapKey, state: null };
    }
    return { mapKey, state: current };
  }

  assertAllowed(scope: Scope, key: string, now = Date.now()) {
    const trimmed = key.trim().toLowerCase();
    if (!trimmed) return;
    const { state } = this.getState(scope, trimmed, now);
    if (state?.lockedUntil && state.lockedUntil > now) {
      const error = new Error("AUTH_RATE_LIMITED");
      (error).name = "AuthRateLimitError";
      throw error;
    }
  }

  registerFailure(scope: Scope, key: string, now = Date.now()) {
    const trimmed = key.trim().toLowerCase();
    if (!trimmed) return;
    const { mapKey, state } = this.getState(scope, trimmed, now);
    const next: CounterState = state && state.firstAttemptAt + WINDOW_MS > now
      ? {
          count: state.count + 1,
          firstAttemptAt: state.firstAttemptAt,
          lastAttemptAt: now,
          lockedUntil: state.lockedUntil,
        }
      : {
          count: 1,
          firstAttemptAt: now,
          lastAttemptAt: now,
          lockedUntil: 0,
        };
    if (next.count >= LIMITS[scope]) {
      next.lockedUntil = now + LOCK_MS;
    }
    this.states.set(mapKey, next);
  }

  registerSuccess(scope: Scope, key: string) {
    const trimmed = key.trim().toLowerCase();
    if (!trimmed) return;
    this.states.delete(`${scope}:${trimmed}`);
  }
}

function normalizeIp(req: Request) {
  return (req.ip || req.socket.remoteAddress || "unknown").trim().toLowerCase();
}

export const authRateLimiter = new InMemoryAuthRateLimiter();

export function assertAuthAttemptAllowed(req: Request, action: "login" | "register", phone: string) {
  const ip = normalizeIp(req);
  authRateLimiter.assertAllowed(`${action}:ip`, ip);
  authRateLimiter.assertAllowed(`${action}:phone`, phone);
}

export function recordAuthAttemptFailure(req: Request, action: "login" | "register", phone: string) {
  const ip = normalizeIp(req);
  authRateLimiter.registerFailure(`${action}:ip`, ip);
  authRateLimiter.registerFailure(`${action}:phone`, phone);
}

export function recordAuthAttemptSuccess(req: Request, action: "login" | "register", phone: string) {
  const ip = normalizeIp(req);
  authRateLimiter.registerSuccess(`${action}:phone`, phone);
  authRateLimiter.registerSuccess(`${action}:ip`, ip);
}
