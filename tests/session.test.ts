import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "../server/db";
import { createContext } from "../server/_core/context";
import { sdk } from "../server/_core/sdk";

const user = {
  id: 42,
  openId: "local:13800000000",
  role: "user" as const,
};

describe("local session token", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates and verifies a standalone JWT session", async () => {
    process.env.JWT_SECRET = "test-secret-with-more-than-24-characters";
    const token = await sdk.createSessionToken(user, 60_000);
    const payload = await sdk.verifySession(token);
    expect(payload).toMatchObject({ userId: 42, openId: user.openId, role: "user" });
  });

  it("rejects an invalid token", async () => {
    process.env.JWT_SECRET = "test-secret-with-more-than-24-characters";
    await expect(sdk.verifySession("invalid-token")).resolves.toBeNull();
  });

  it("propagates a database outage instead of downgrading it to an anonymous session", async () => {
    process.env.JWT_SECRET = "test-secret-with-more-than-24-characters";
    const token = await sdk.createSessionToken(user, 60_000);
    const outage = new Error("controlled database outage");
    vi.spyOn(db, "getUserById").mockRejectedValueOnce(outage);

    await expect(createContext({
      req: { headers: { authorization: `Bearer ${token}` } },
      res: {},
    } as never)).rejects.toBe(outage);
  });
});
