import { describe, expect, it } from "vitest";

import { assertDemoSeedAllowed } from "../scripts/lib/demo-seed-guard";

describe("demo seed guard", () => {
  it("rejects production execution", () => {
    expect(() => assertDemoSeedAllowed("mysql://root:test@127.0.0.1:3306/shenghuobang_demo", {
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "true",
    })).toThrow("db:seed is disabled when NODE_ENV=production");
  });

  it("rejects missing authorization flag", () => {
    expect(() => assertDemoSeedAllowed("mysql://root:test@127.0.0.1:3306/shenghuobang_demo", {
      NODE_ENV: "development",
    })).toThrow("db:seed requires ALLOW_DEMO_SEED=true");
  });

  it("rejects non-local hosts and production-like database names", () => {
    expect(() => assertDemoSeedAllowed("mysql://root:test@8.8.8.8:3306/shenghuobang_demo", {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
    })).toThrow();
    expect(() => assertDemoSeedAllowed("mysql://root:test@127.0.0.1:3306/shenghuobang_prod", {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
    })).toThrow();
  });

  it("allows local demo-like databases", () => {
    expect(() => assertDemoSeedAllowed("mysql://root:test@127.0.0.1:3306/shenghuobang_acceptance", {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
    })).not.toThrow();
  });
});
