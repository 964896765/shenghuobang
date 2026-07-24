import { afterEach, describe, expect, it } from "vitest";

import {
  assertAuthAttemptAllowed,
  authRateLimiter,
  recordAuthAttemptFailure,
  recordAuthAttemptSuccess,
} from "../server/_core/auth-rate-limit";

function fakeRequest(ip: string) {
  return {
    ip,
    socket: { remoteAddress: ip },
  } as never;
}

describe("auth rate limit", () => {
  afterEach(() => authRateLimiter.reset());

  it("allows normal login attempts", () => {
    expect(() => assertAuthAttemptAllowed(fakeRequest("10.0.0.1"), "login", "13800000001")).not.toThrow();
  });

  it("blocks repeated login failures for the same phone", () => {
    const req = fakeRequest("10.0.0.2");
    for (let i = 0; i < 5; i += 1) {
      recordAuthAttemptFailure(req, "login", "13800000002");
    }
    expect(() => assertAuthAttemptAllowed(req, "login", "13800000002")).toThrowError("AUTH_RATE_LIMITED");
  });

  it("isolates phone buckets and resets after success", () => {
    const req = fakeRequest("10.0.0.3");
    for (let i = 0; i < 4; i += 1) {
      recordAuthAttemptFailure(req, "login", "13800000003");
    }
    expect(() => assertAuthAttemptAllowed(req, "login", "13800000004")).not.toThrow();
    recordAuthAttemptSuccess(req, "login", "13800000003");
    expect(() => assertAuthAttemptAllowed(req, "login", "13800000003")).not.toThrow();
  });
});
