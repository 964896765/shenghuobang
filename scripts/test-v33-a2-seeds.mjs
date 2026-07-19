import assert from "node:assert/strict";

import {
  A2_EXPECTED_MANIFEST_SHA256,
  A2_EXPECTED_SEED_DATA_SHA256,
  assertSafeA2DatabaseUrl,
  canonicalJson,
  loadVerifiedManifest,
  verifySeedData,
  verifyManifestObject,
} from "./lib/v33-a2-contract.mjs";

const { manifest, seedData, result } = await loadVerifiedManifest();
assert.equal(result.ok, true);
assert.equal(result.checksum, A2_EXPECTED_MANIFEST_SHA256);
assert.equal(result.seedDataChecksum, A2_EXPECTED_SEED_DATA_SHA256);
assert.equal(seedData.identityTypes.length, 10);
assert.equal(seedData.certificationTypes.length, 3);
assert.equal(seedData.capabilities.length, 68);
assert.equal(seedData.projectRoles.length, 9);

const mutation = structuredClone(manifest);
mutation.sources[0].path += "x";
const mutationResult = verifyManifestObject(mutation);
assert.equal(mutationResult.ok, false);
assert.equal(mutationResult.severity, "BLOCKING");
assert.equal(mutationResult.handling, "ABORT_RUN");
assert.equal(mutationResult.code, "MIG-SEED-MANIFEST-CHECKSUM-MISMATCH");

const seedMutation = structuredClone(seedData);
seedMutation.capabilities[0].description += "x";
const seedMutationResult = verifySeedData(seedMutation);
assert.equal(seedMutationResult.ok, false);
assert.equal(seedMutationResult.severity, "BLOCKING");
assert.equal(seedMutationResult.handling, "ABORT_RUN");
assert.equal(seedMutationResult.code, "MIG-SEED-DATA-CHECKSUM-MISMATCH");

const memoryDatabase = new Map();
function applyToMemory(database, currentManifest) {
  for (const key of [
    "identityTypes",
    "certificationTypes",
    "capabilities",
    "projectRoles",
  ]) {
    const table = database.get(key) ?? new Map();
    for (const row of currentManifest[key]) {
      const existing = table.get(row.code);
      if (existing && canonicalJson(existing) !== canonicalJson(row)) {
        throw new Error(`MIG-SEED-PUBLISHED-CODE-DRIFT:${key}.${row.code}`);
      }
      if (!existing) table.set(row.code, structuredClone(row));
    }
    database.set(key, table);
  }
}

applyToMemory(memoryDatabase, seedData);
const firstCounts = Object.fromEntries(
  [...memoryDatabase].map(([key, rows]) => [key, rows.size]),
);
applyToMemory(memoryDatabase, seedData);
const secondCounts = Object.fromEntries(
  [...memoryDatabase].map(([key, rows]) => [key, rows.size]),
);
assert.deepEqual(
  secondCounts,
  firstCounts,
  "second seed execution must not add duplicates",
);

const drift = structuredClone(seedData);
drift.projectRoles[0].description = "changed published meaning";
assert.throws(
  () => applyToMemory(memoryDatabase, drift),
  /MIG-SEED-PUBLISHED-CODE-DRIFT/,
  "published code drift must fail rather than overwrite",
);

assert.equal(
  assertSafeA2DatabaseUrl("mysql://tester:secret@127.0.0.1:3306/v33a2_empty")
    .databaseName,
  "v33a2_empty",
);
for (const unsafeUrl of [
  undefined,
  "mysql://tester:secret@127.0.0.1:3306/",
  "mysql://tester:secret@127.0.0.1:3306/production",
  "mysql://tester:secret@127.0.0.1:3306/prod",
  "mysql://tester:secret@127.0.0.1:3306/main",
  "mysql://tester:secret@127.0.0.1:3306/shenghuobang",
  "mysql://tester:secret@prod.example.com:3306/test_v33a2",
]) {
  assert.throws(() => assertSafeA2DatabaseUrl(unsafeUrl));
}

console.log("V3.3-A A2 frozen seed tests: PASS");
console.log(`manifestSha256=${result.checksum}`);
console.log(`seedDataSha256=${result.seedDataChecksum}`);
console.log(
  `counts=${JSON.stringify(secondCounts)} secondRunDelta=0 drift=BLOCKING`,
);
