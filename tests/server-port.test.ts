import { describe, expect, it } from "vitest";

import { resolveListeningPort } from "../server/_core/index";

describe("server port behavior", () => {
  it("falls back to the next port in development", async () => {
    const port = await resolveListeningPort({
      preferredPort: 3000,
      isProduction: false,
      isPortAvailableFn: async (candidate) => candidate === 3001,
    });
    expect(port).toBe(3001);
  });

  it("fails fast when the production port is occupied", async () => {
    await expect(resolveListeningPort({
      preferredPort: 3000,
      isProduction: true,
      isPortAvailableFn: async () => false,
    })).rejects.toThrow("port_in_use:3000");
  });
});
