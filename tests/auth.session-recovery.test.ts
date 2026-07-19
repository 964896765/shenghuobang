import { describe, expect, it } from "vitest";
import { ApiError, resolveAuthMeFailure } from "../lib/_core/api-error";

describe("mobile session recovery", () => {
  it("treats an explicit 401 as an expired session", async () => {
    expect(resolveAuthMeFailure(new ApiError("Authentication required", 401))).toBeNull();
  });

  it("preserves the cached session when auth.me is temporarily unreachable", async () => {
    const outage = new Error("controlled network outage");

    expect(() => resolveAuthMeFailure(outage)).toThrow(outage);
  });
});
