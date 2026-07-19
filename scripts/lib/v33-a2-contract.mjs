import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const A2_MANIFEST_PATH = new URL(
  "../../drizzle/seeds/v33-a2-directory-manifest.json",
  import.meta.url,
);
export const A2_MANIFEST_CHECKSUM_PATH = new URL(
  "../../drizzle/seeds/v33-a2-directory-manifest.sha256",
  import.meta.url,
);
export const A2_SEED_DATA_PATH = new URL(
  "../../drizzle/seeds/v33-a2-directory-seeds.json",
  import.meta.url,
);
export const A2_SEED_DATA_CHECKSUM_PATH = new URL(
  "../../drizzle/seeds/v33-a2-directory-seeds.sha256",
  import.meta.url,
);

export const A2_MANIFEST_VERSION = "v3.3-a2-seed-1";
export const A2_MIGRATION_VERSION = "v3.3-a2.0.0";
export const A2_EXPECTED_MANIFEST_SHA256 =
  "95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983";
export const A2_EXPECTED_SEED_DATA_SHA256 =
  "bcf102f7d379424bba5e8dd025c3e5563531111489097c162716c6b3b4a348bb";
export const A2_EXPECTED_COUNTS = Object.freeze({
  identityTypes: 10,
  certificationTypes: 3,
  capabilities: 68,
  projectRoles: 9,
});

export const LEGACY_ANOMALY_RULES = Object.freeze({
  orphan_user: Object.freeze({
    severity: "BLOCKING",
    handling: "ABORT_RUN",
    status: "open",
  }),
  cancelled_default_idle: Object.freeze({
    severity: "INFO",
    handling: "CONTINUE",
    status: "resolved",
  }),
  missing_valid_mode: Object.freeze({
    severity: "WARNING",
    handling: "MIN_PRIVILEGE",
    status: "open",
  }),
  missing_item: Object.freeze({
    severity: "BLOCKING",
    handling: "ABORT_RUN",
    status: "open",
  }),
});

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyManifestObject(manifest) {
  const actualChecksum = sha256(canonicalJson(manifest));
  if (actualChecksum !== A2_EXPECTED_MANIFEST_SHA256) {
    return {
      ok: false,
      severity: "BLOCKING",
      handling: "ABORT_RUN",
      code: "MIG-SEED-MANIFEST-CHECKSUM-MISMATCH",
      expectedChecksum: A2_EXPECTED_MANIFEST_SHA256,
      actualChecksum,
    };
  }
  if (
    manifest.manifestVersion !== A2_MANIFEST_VERSION ||
    manifest.migrationVersion !== A2_MIGRATION_VERSION
  ) {
    return {
      ok: false,
      severity: "BLOCKING",
      handling: "ABORT_RUN",
      code: "MIG-SEED-MANIFEST-VERSION-MISMATCH",
    };
  }
  for (const [key, expected] of Object.entries(A2_EXPECTED_COUNTS)) {
    if (manifest.expectedCounts?.[key] !== expected) {
      return {
        ok: false,
        severity: "BLOCKING",
        handling: "ABORT_RUN",
        code: "MIG-SEED-MANIFEST-COUNT-MISMATCH",
        entityType: key,
        expected,
        declared: manifest.expectedCounts?.[key] ?? null,
      };
    }
  }
  return { ok: true, checksum: actualChecksum };
}

export function verifySeedData(seedData) {
  const actualChecksum = sha256(canonicalJson(seedData));
  if (actualChecksum !== A2_EXPECTED_SEED_DATA_SHA256) {
    return {
      ok: false,
      severity: "BLOCKING",
      handling: "ABORT_RUN",
      code: "MIG-SEED-DATA-CHECKSUM-MISMATCH",
      expectedChecksum: A2_EXPECTED_SEED_DATA_SHA256,
      actualChecksum,
    };
  }
  for (const [key, expected] of Object.entries(A2_EXPECTED_COUNTS)) {
    if (seedData[key]?.length !== expected) {
      return {
        ok: false,
        severity: "BLOCKING",
        handling: "ABORT_RUN",
        code: "MIG-SEED-DATA-COUNT-MISMATCH",
        entityType: key,
        expected,
        actual: Array.isArray(seedData[key]) ? seedData[key].length : null,
      };
    }
  }
  return { ok: true, checksum: actualChecksum };
}

export async function loadVerifiedManifest() {
  const [rawManifest, rawChecksum, rawSeedData, rawSeedDataChecksum] =
    await Promise.all([
      readFile(A2_MANIFEST_PATH, "utf8"),
      readFile(A2_MANIFEST_CHECKSUM_PATH, "utf8"),
      readFile(A2_SEED_DATA_PATH, "utf8"),
      readFile(A2_SEED_DATA_CHECKSUM_PATH, "utf8"),
    ]);
  const manifest = JSON.parse(rawManifest);
  const seedData = JSON.parse(rawSeedData);
  const fileChecksum = rawChecksum.trim();
  if (fileChecksum !== A2_EXPECTED_MANIFEST_SHA256) {
    return {
      manifest,
      seedData,
      result: {
        ok: false,
        severity: "BLOCKING",
        handling: "ABORT_RUN",
        code: "MIG-SEED-MANIFEST-CHECKSUM-FILE-MISMATCH",
        expectedChecksum: A2_EXPECTED_MANIFEST_SHA256,
        actualChecksum: fileChecksum,
      },
    };
  }
  const manifestResult = verifyManifestObject(manifest);
  if (!manifestResult.ok) return { manifest, seedData, result: manifestResult };
  const seedDataFileChecksum = rawSeedDataChecksum.trim();
  if (seedDataFileChecksum !== A2_EXPECTED_SEED_DATA_SHA256) {
    return {
      manifest,
      seedData,
      result: {
        ok: false,
        severity: "BLOCKING",
        handling: "ABORT_RUN",
        code: "MIG-SEED-DATA-CHECKSUM-FILE-MISMATCH",
        expectedChecksum: A2_EXPECTED_SEED_DATA_SHA256,
        actualChecksum: seedDataFileChecksum,
      },
    };
  }
  const seedDataResult = verifySeedData(seedData);
  if (!seedDataResult.ok) return { manifest, seedData, result: seedDataResult };
  for (const source of manifest.sources) {
    const sourceBytes = await readFile(
      new URL(`../../${source.path}`, import.meta.url),
    );
    const actualSourceChecksum = sha256(sourceBytes);
    if (actualSourceChecksum !== source.sha256) {
      return {
        manifest,
        seedData,
        result: {
          ok: false,
          severity: "BLOCKING",
          handling: "ABORT_RUN",
          code: "MIG-SEED-MANIFEST-MISMATCH",
          sourcePath: source.path,
          expectedChecksum: source.sha256,
          actualChecksum: actualSourceChecksum,
        },
      };
    }
  }
  return {
    manifest,
    seedData,
    result: {
      ok: true,
      checksum: manifestResult.checksum,
      seedDataChecksum: seedDataResult.checksum,
    },
  };
}

export function getLegacyAnomalyRule(code) {
  return (
    LEGACY_ANOMALY_RULES[code] ?? {
      severity: "BLOCKING",
      handling: "ABORT_RUN",
      status: "open",
    }
  );
}

export function detailChecksum(detail) {
  return sha256(canonicalJson(detail ?? null));
}

export function anomalyFingerprint({
  migrationVersion,
  sourceBaseline,
  entityType,
  entityId,
  code,
  detailChecksum: checksum,
}) {
  return sha256(
    [
      migrationVersion,
      sourceBaseline,
      entityType,
      entityId ?? "-",
      code,
      checksum,
    ].join("|"),
  );
}

export function assertSafeA2DatabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL must be explicitly set for the isolated A2 database",
    );
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!/^mysql:$/i.test(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the mysql protocol");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a non-empty database name");
  }
  const lowerDatabaseName = databaseName.toLowerCase();
  if (!/(v33a2_empty|v33_a2_empty|test_v33a2)/.test(lowerDatabaseName)) {
    throw new Error(`Unsafe A2 database name: ${databaseName}`);
  }
  if (
    /(^|[_-])(production|prod|main|shenghuobang)([_-]|$)/.test(
      lowerDatabaseName,
    )
  ) {
    throw new Error(
      `Production-like A2 database name is forbidden: ${databaseName}`,
    );
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `Remote database hosts are forbidden for A2.1: ${parsed.hostname}`,
    );
  }
  return { parsed, databaseName };
}
