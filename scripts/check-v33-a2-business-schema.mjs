import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const [schema, journalRaw, snapshotRaw, baselineReport] = await Promise.all([
  read("drizzle/schema.ts"),
  read("drizzle/meta/_journal.json"),
  read("drizzle/meta/0029_snapshot.json"),
  read("docs/execution/v3.3-a-a2/A2_0_DATABASE_FACT_REPORT.md"),
]);
const journal = JSON.parse(journalRaw);
const snapshot = JSON.parse(snapshotRaw);
const sqlFiles = (await readdir(path.join(root, "drizzle")))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const a22Files = sqlFiles.filter((file) => /^00(?:2[1-9])_/.test(file));
const a22SqlByFile = Object.fromEntries(
  await Promise.all(a22Files.map(async (file) => [file, await read(`drizzle/${file}`)])),
);
const a22Sql = Object.values(a22SqlByFile).join("\n");

const businessTables = [
  "identity_types",
  "business_identities",
  "identity_profiles",
  "workspace_preferences",
  "certification_types",
  "certifications",
  "certification_documents",
  "certification_review_actions",
  "capabilities",
  "organizations",
  "organization_memberships",
  "organization_invitations",
  "organization_positions",
  "organization_member_positions",
  "position_capabilities",
  "organization_owner_transfers",
  "project_memberships",
  "project_invitations",
  "project_roles",
  "project_membership_roles",
  "project_role_capabilities",
  "platform_staff_positions",
  "capability_grants",
  "permission_audit_events",
];
const a22NewTables = businessTables.filter(
  (table) => !["identity_types", "certification_types", "capabilities", "project_roles"].includes(table),
);

check(Object.keys(snapshot.tables).length === 95, `Expected 95 tables, found ${Object.keys(snapshot.tables).length}`);
check((schema.match(/mysqlTable\(/g) ?? []).length === 95, "Schema must define 95 mysqlTable objects");
check(businessTables.length === 24, "Frozen business-table list must contain 24 entries");
check(a22NewTables.length === 20, "A2.2 must add 20 business tables");
for (const table of businessTables) {
  check(Boolean(snapshot.tables[table]), `Missing business table ${table}`);
}

const expectedCreateCounts = [2, 7, 4, 1, 3, 3, 0, 0, 0];
check(a22Files.length === 9, `Expected migrations 0021-0029, found ${a22Files.length}`);
a22Files.forEach((file, index) => {
  const sql = a22SqlByFile[file];
  check((sql.match(/CREATE TABLE/g) ?? []).length === expectedCreateCounts[index], `${file} CREATE TABLE count mismatch`);
  check(!/\bDROP\s+(?:TABLE|COLUMN)\b/i.test(sql), `${file} must not drop tables or columns`);
  check(!/^(?:<<<<<<<|=======|>>>>>>>|\+--)/m.test(sql), `${file} contains a patch/conflict marker`);
});

const migrationRunTables = [
  "business_identities",
  "identity_profiles",
  "certifications",
  "certification_documents",
  "certification_review_actions",
  "project_memberships",
  "project_membership_roles",
  "platform_staff_positions",
  "workspace_preferences",
];
for (const table of migrationRunTables) {
  const definition = snapshot.tables[table];
  check(definition?.columns.migrationRunId?.type === "varchar(64)", `${table}.migrationRunId missing`);
  check(
    Object.values(definition?.foreignKeys ?? {}).some(
      (foreignKey) =>
        foreignKey.tableTo === "migration_runs" &&
        foreignKey.columnsFrom.includes("migrationRunId"),
    ),
    `${table}.migrationRunId FK missing`,
  );
}

for (const table of [
  "certifications",
  "organization_invitations",
  "project_invitations",
  "organization_owner_transfers",
  "platform_staff_positions",
  "capability_grants",
]) {
  const definition = snapshot.tables[table];
  check(definition?.columns.activeDedupeKey?.type === "varchar(191)", `${table}.activeDedupeKey missing`);
  check(
    Object.values(definition?.indexes ?? {}).some(
      (index) =>
        index.isUnique &&
        index.columns.some((column) =>
          typeof column === "string"
            ? column === "activeDedupeKey"
            : column.expression === "activeDedupeKey",
        ),
    ),
    `${table}.activeDedupeKey unique index missing`,
  );
}

const existingAdditions = {
  projects: ["authorizationVersion"],
  milestones: [
    "assigneeProjectMembershipId",
    "lastSubmittedByProjectMembershipId",
    "authorizationVersion",
  ],
  project_files: [
    "confidentialityLevel",
    "ndaRequired",
    "accessPolicyVersion",
    "disabledAt",
    "disabledBy",
  ],
  project_acceptances: ["reviewerProjectMembershipId", "deliverySubmissionVersion"],
  stored_files: ["accessPolicyVersion"],
  conversations: ["status", "authorizationVersion"],
};
for (const [table, columns] of Object.entries(existingAdditions)) {
  for (const column of columns) {
    check(Boolean(snapshot.tables[table]?.columns[column]), `${table}.${column} missing`);
  }
}

const compositeForeignKeys = [
  "organization_invitations_inviter_org_fk",
  "organization_memberships_source_invitation_org_fk",
  "organization_member_positions_member_org_fk",
  "organization_member_positions_position_org_fk",
  "position_capabilities_position_org_fk",
  "organization_owner_transfers_from_org_fk",
  "organization_owner_transfers_to_org_fk",
  "project_invitations_inviter_project_fk",
  "project_memberships_source_invitation_project_fk",
  "project_membership_roles_member_project_fk",
  "milestones_assignee_project_membership_fk",
  "milestones_submitter_project_membership_fk",
  "project_acceptances_reviewer_project_membership_fk",
];
for (const foreignKey of compositeForeignKeys) {
  check(a22Sql.includes(foreignKey), `Composite FK migration missing ${foreignKey}`);
}
check(
  !/submittedBy[\s\S]{0,160}reviewerProjectMembershipId\s*=|reviewerProjectMembershipId[\s\S]{0,160}submittedBy/i.test(a22Sql),
  "submittedBy must not map to reviewerProjectMembershipId",
);

check(journal.entries.length === 30, `Expected 30 journal entries, found ${journal.entries.length}`);
for (let index = 0; index < journal.entries.length; index += 1) {
  check(journal.entries[index].idx === index, `Journal idx ${index} is not continuous`);
  check(`${journal.entries[index].tag}.sql` === sqlFiles[index], `Journal/file mismatch at ${index}`);
}

const baselineRows = [...baselineReport.matchAll(
  /\| `(00(?:0\d|1[0-4])_[^`]+\.sql)` \| (\d+) \| `([0-9a-f]{64})` \|/g,
)];
check(baselineRows.length === 15, "A2.0 baseline hash inventory is incomplete");
for (const [, file, expectedBytes, expectedHash] of baselineRows) {
  const bytes = await readFile(path.join(root, "drizzle", file));
  check(bytes.length === Number(expectedBytes), `${file} byte count changed`);
  check(sha256(bytes) === expectedHash, `${file} SHA-256 changed`);
}

if (failures.length > 0) {
  console.error(`V3.3-A A2.2 business schema: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("V3.3-A A2.2 business schema: PASS");
  console.log("tables=95 business=24 a22New=20 existingAdditive=6 compositeFK=13");
  console.log("migrations=0021..0029 journal=30 historicalMigrationsUnchanged=true");
}
