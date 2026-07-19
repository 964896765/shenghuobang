import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/_core/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("correct-horse-123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
