import { assertSafeNamedLocalTestDatabase } from "./mysql-test-config.mjs";

const ALLOWED_DATABASE_PATTERNS = [/demo/i, /test/i, /acceptance/i, /dev/i, /development/i] as RegExp[];

export function assertDemoSeedAllowed(rawUrl: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("db:seed is disabled when NODE_ENV=production");
  }
  if (env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("db:seed requires ALLOW_DEMO_SEED=true");
  }
  return assertSafeNamedLocalTestDatabase(rawUrl, {
    consumerName: "seed script",
    databaseNamePatterns: ALLOWED_DATABASE_PATTERNS as never[],
  });
}
