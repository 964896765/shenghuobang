import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const specDir = path.join(root, "docs", "execution", "v3.3-a-a1");
const names = {
  data: "DATA_DICTIONARY.md",
  migration: "LEGACY_MIGRATION_MATRIX.md",
  states: "STATE_MACHINES.md",
  security: "SECURITY_TEST_MATRIX.md",
  report: "A1_EXECUTION_REPORT.md",
  capabilities: "CAPABILITY_CATALOG.md",
};

const docs = Object.fromEntries(
  Object.entries(names).map(([key, file]) => [
    key,
    fs.readFileSync(path.join(specDir, file), "utf8"),
  ]),
);

const issues = [];
const checks = [];
const assert = (condition, message) => {
  if (!condition) issues.push(message);
};
const pass = (message) => checks.push(message);
const unique = values => [...new Set(values)];
const matches = (text, regex) => [...text.matchAll(regex)].map(match => match[1]);

const businessTables = matches(
  docs.data,
  /^\|\s*(?:[1-9]|1\d|2[0-4])\s*\|\s*`([a-z0-9_]+)`\s*\|/gm,
);
const infrastructureTables = matches(
  docs.data,
  /^\|\s*M[1-3]\s*\|\s*`([a-z0-9_]+)`\s*\|/gm,
);
const expectedInfrastructure = [
  "migration_runs",
  "migration_checkpoints",
  "migration_anomalies",
];

assert(businessTables.length === 24, `业务基础表应为 24，实际 ${businessTables.length}`);
assert(
  JSON.stringify(infrastructureTables) === JSON.stringify(expectedInfrastructure),
  `迁移基础设施表应为 ${expectedInfrastructure.join(", ")}，实际 ${infrastructureTables.join(", ")}`,
);
for (const table of expectedInfrastructure) {
  assert(docs.data.includes(`### 9.${expectedInfrastructure.indexOf(table) + 1} \`${table}\``), `${table} 缺少完整定义章节`);
}
for (const field of [
  "migrationVersion",
  "migrationRunId",
  "sourceBaseline",
  "startedAt",
  "completedAt",
  "failedAt",
  "checksum",
  "checkpointKey",
  "processedCount",
  "succeededCount",
  "failedCount",
  "skippedCount",
  "severity",
  "entityType",
  "entityId",
  "code",
  "detail JSON",
]) {
  assert(docs.data.includes(field), `迁移基础设施契约缺少 ${field}`);
}
pass("迁移基础设施表及字段契约");

const adkTables = [
  "certifications",
  "organization_invitations",
  "project_invitations",
  "organization_owner_transfers",
  "platform_staff_positions",
  "capability_grants",
];
const adkRows = matches(docs.data, /^\|\s*ADK-\d{2}\s*\|\s*`([a-z0-9_]+)`\s*\|/gm);
assert(JSON.stringify(adkRows) === JSON.stringify(adkTables), `ADK 规则表不完整：${adkRows.join(", ")}`);

const tableBlock = table => {
  const headingPattern = new RegExp("^### \\d+\\.\\d+ `" + table + "`$", "m");
  const match = headingPattern.exec(docs.data);
  if (!match) return "";
  const start = match.index;
  const next = docs.data.indexOf("\n### ", start + match[0].length);
  return docs.data.slice(start, next < 0 ? docs.data.length : next);
};
for (const table of adkTables) {
  const block = tableBlock(table);
  assert(block.includes("activeDedupeKey VARCHAR(191) NULL"), `${table} 缺少真实 activeDedupeKey 字段`);
  assert(block.includes("UNIQUE(activeDedupeKey)"), `${table} 缺少 activeDedupeKey 唯一索引`);
}
assert(docs.data.includes("终态时，必须在同一 CAS 更新中将 key 置 `NULL`"), "ADK 缺少终态清空规则");
assert(docs.data.includes("禁止使用时间、随机数或 requestId 参与 key"), "ADK 格式不是确定性的");
pass("6 条 activeDedupeKey 真实字段、唯一索引与并发规则");

const stableTables = [
  "organization_memberships",
  "project_memberships",
  "organization_member_positions",
  "project_membership_roles",
  "position_capabilities",
  "project_role_capabilities",
];
const stableRows = matches(docs.data, /^\|\s*`([a-z0-9_]+)`\s*\|[^\n]+\|[^\n]+\|[^\n]+reactivated[^\n]+\|$/gm)
  .filter(table => stableTables.includes(table));
assert(unique(stableRows).length === 6, `模式 A 关系应为 6，实际 ${unique(stableRows).length}`);
for (const table of stableTables) {
  const block = tableBlock(table);
  assert(block.includes("lastRequestId VARCHAR(64) NOT NULL"), `${table} 缺少 lastRequestId`);
  assert(block.includes("version INT NOT NULL DEFAULT 1"), `${table} 缺少 version`);
  assert(block.includes("模式 A：稳定关系行"), `${table} 未明确模式 A`);
}
assert(docs.states.includes("left/removed → active"), "状态机缺少成员受控重新激活");
assert(docs.states.includes("`revoked -> active`"), "状态机缺少分配受控重新激活");
assert((docs.states + docs.data).includes("无新邀请/分配依据、直接把终态改 active"), "状态机/数据字典缺少直接恢复拒绝规则");
pass("6 类唯一约束/终态冲突采用模式 A 收敛");

const forbiddenMarker = "submittedBy -> reviewerProjectMembershipId = FORBIDDEN";
for (const key of ["data", "migration", "security"]) {
  assert(docs[key].includes(forbiddenMarker), `${names[key]} 缺少 reviewer 禁止映射标记`);
}
const obsoleteReviewerRule = "仅当 submittedBy 唯一映射同项目成员时回填 reviewer";
for (const [key, text] of Object.entries(docs)) {
  assert(!text.includes(obsoleteReviewerRule), `${names[key]} 仍保留错误 reviewer 回填规则`);
}
assert(docs.migration.includes("reviewer 全部 `NULL`"), "迁移矩阵未冻结历史 reviewer 全 NULL");
assert(docs.security.includes("`SEC-043`"), "缺少历史提交者不映射 reviewer 的专项测试");
pass("submittedBy 不映射 reviewer，未知 reviewer 写 anomaly");

const cfkIds = matches(docs.data, /^\|\s*(CFK-\d{2})\s*\|/gm);
assert(cfkIds.length === 13, `组合 FK 应为 13，实际 ${cfkIds.length}`);
assert(unique(cfkIds).length === 13, "组合 FK 编号重复");
for (const required of [
  "organization_invitations(organizationId,inviterMembershipId)",
  "organization_member_positions(organizationId,membershipId)",
  "position_capabilities(organizationId,positionId)",
  "project_invitations(projectId,inviterMembershipId)",
  "project_membership_roles(projectId,projectMembershipId)",
  "project_acceptances(projectId,reviewerProjectMembershipId)",
]) {
  assert(docs.data.includes(required), `缺少跨范围组合 FK：${required}`);
}
assert(docs.data.includes("无法使用组合 FK 的仅限真正多态关系"), "多态关系缺少明确替代约束");
assert(docs.data.includes("SELECT ... FOR UPDATE"), "多态替代约束缺少事务锁");
assert(docs.security.includes("`SEC-044`") && docs.security.includes("`SEC-045`"), "组合 FK/替代约束缺少安全测试");
pass("13 条组合 FK 与多态替代约束");

const migrationBusinessRows = matches(
  docs.migration,
  /^\|\s*`([a-z0-9_]+)`\s*\|[^\n]+\|[^\n]+\|[^\n]+\|$/gm,
).filter(table => businessTables.includes(table));
const migrationInfraRows = expectedInfrastructure.filter(table =>
  docs.migration.includes(`| \`${table}\` |`),
);
const stateMachineSections = matches(docs.states, /^##\s+(?:[2-9]|10)\.\s+(.+)$/gm);
const securityIds = unique(matches(docs.security, /`(SEC-\d{3})`/g));
const existingFieldRows = matches(
  docs.data.slice(docs.data.indexOf("### 3.5"), docs.data.indexOf("## 4.")),
  /^\|\s*`([a-z0-9_]+)`\s*\|/gm,
);
assert(unique(migrationBusinessRows).length === 24, `迁移矩阵业务表覆盖应为 24，实际 ${unique(migrationBusinessRows).length}`);
assert(migrationInfraRows.length === 3, `迁移矩阵基础设施覆盖应为 3，实际 ${migrationInfraRows.length}`);
assert(existingFieldRows.length === 6, `现有表追加字段应涉及 6 张表，实际 ${existingFieldRows.length}`);
assert(stateMachineSections.length === 9, `状态机应为 9，实际 ${stateMachineSections.length}`);
assert(securityIds.length === 48, `安全测试应为 48，实际 ${securityIds.length}`);
for (const token of ["24 张业务基础表", "3 张迁移基础设施表", "6 张现有表追加字段", "48 项"]) {
  assert(docs.report.includes(token), `执行报告缺少一致计数：${token}`);
}
pass("数据字典、迁移矩阵、状态机、安全测试与报告计数");

const orderSection = docs.data.slice(docs.data.indexOf("## 10. A2 建表与回填顺序"));
for (const table of [...expectedInfrastructure, ...businessTables]) {
  assert(orderSection.includes(table), `A2 建表顺序缺少 ${table}`);
}
assert(orderSection.includes("Phase D: add deferred/cyclic FK"), "缺少循环 FK Phase D");
assert(orderSection.includes("禁止 `SET FOREIGN_KEY_CHECKS=0`"), "未禁止关闭 FOREIGN_KEY_CHECKS");
pass("27 张契约表与循环 FK 分步顺序");

const anomalyRows = [...docs.migration.matchAll(
  /^\|\s*`(MIG-[A-Z0-9-]+)`\s*\|\s*(INFO|WARNING|BLOCKING)\s*\|\s*([A-Z_]+)\s*\|/gm,
)].map(match => ({ code: match[1], severity: match[2], handling: match[3] }));
const catalogCodes = unique(anomalyRows.map(row => row.code));
const allCodeMentions = unique(
  Object.values(docs).flatMap(text => matches(text, /`(MIG-[A-Z0-9-]+)`/g)),
);
for (const code of allCodeMentions) {
  assert(catalogCodes.includes(code), `anomaly code ${code} 未登记严重度/handling`);
}
for (const row of anomalyRows) {
  if (row.severity === "BLOCKING") {
    assert(row.handling === "ABORT_RUN", `${row.code} 为 BLOCKING 但 handling=${row.handling}`);
  }
}
assert(docs.migration.includes("绝不允许转 completed"), "BLOCKING anomaly 未明确阻止 completed");
pass("anomaly code、严重度、handling 与 BLOCKING 语义");

const manifestMatch = docs.migration.match(/```json\n([^\n]+)\n```/);
const checksumMatch = docs.migration.match(/`manifestChecksum = ([0-9a-f]{64})`/);
assert(Boolean(manifestMatch && checksumMatch), "缺少 canonical seed manifest 或 manifestChecksum");
if (manifestMatch && checksumMatch) {
  const manifest = JSON.parse(manifestMatch[1]);
  for (const source of manifest.sources) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, source.path))).digest("hex");
    assert(actual === source.sha256, `seed manifest 源 hash 失配：${source.path}`);
  }
  const actualManifestChecksum = crypto.createHash("sha256").update(manifestMatch[1], "utf8").digest("hex");
  assert(actualManifestChecksum === checksumMatch[1], "manifestChecksum 与 canonical JSON 不一致");
}
for (const token of ["MySQL 8.0.34", "固定 500 行", "5 秒", "重试 3 次", "恢复（resume）", "重跑（rerun）", "恢复回滚（recovery）"]) {
  assert(docs.migration.includes(token), `A2 确定性契约缺少 ${token}`);
}
pass("manifest SHA-256 与 A2 确定性参数");

if (issues.length > 0) {
  console.error(`V3.3-A/A1.1 consistency check: FAIL (${issues.length} issues)`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("V3.3-A/A1.1 consistency check: PASS");
console.log(`- business tables: ${businessTables.length}`);
console.log(`- migration infrastructure tables: ${infrastructureTables.length}`);
console.log(`- existing tables with additions: ${existingFieldRows.length}`);
console.log(`- activeDedupeKey rules: ${adkRows.length}`);
console.log(`- stable relationship Mode A rules: ${unique(stableRows).length}`);
console.log(`- composite foreign keys: ${cfkIds.length}`);
console.log(`- state machines: ${stateMachineSections.length}`);
console.log(`- security tests: ${securityIds.length}`);
console.log(`- anomaly codes: ${catalogCodes.length}`);
console.log(`- assertions: ${checks.length}; issues: 0`);
