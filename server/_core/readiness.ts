import { access, chmod, mkdir, writeFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { sql } from "drizzle-orm";
import { requireDb } from "../db";
import { getStorageProvider } from "../storage/registry";
import { ENV, validateConfiguration, type RuntimeEnvironment } from "./env";

export type ReadinessChecks = { database: "ok" | "failed"; storage: "ok" | "failed"; configuration: "ok" | "failed" };

async function checkLocalStorage(env: RuntimeEnvironment) {
  const directory = path.resolve(env.uploadDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
  await access(directory, constants.W_OK);
  const probe = path.join(directory, `.readiness-${crypto.randomUUID()}`);
  await writeFile(probe, "ok", { flag: "wx", mode: 0o600 });
  await unlink(probe);
}

export async function checkReadiness(env: RuntimeEnvironment = ENV): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  const config = validateConfiguration(env);
  const checks: ReadinessChecks = {
    configuration: config.ok ? "ok" : "failed",
    database: "failed",
    storage: "failed",
  };

  if (config.ok) {
    try {
      const db = await requireDb();
      await db.execute(sql`SELECT 1`);
      const versions = await db.execute(sql`SELECT version FROM app_schema_versions WHERE version = 'v3.2.1' LIMIT 1`);
      const rows = Array.isArray(versions) ? versions[0] : [];
      checks.database = Array.isArray(rows) && rows.length === 1 ? "ok" : "failed";
    } catch {
      checks.database = "failed";
    }
    try {
      if (env.storageProvider === "local") await checkLocalStorage(env);
      else if (!(await getStorageProvider().checkReady())) throw new Error("storage unavailable");
      checks.storage = "ok";
    } catch {
      checks.storage = "failed";
    }
  }
  return { ok: Object.values(checks).every((value) => value === "ok"), checks };
}
