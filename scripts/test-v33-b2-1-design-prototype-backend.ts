import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createProjectDeliveryFileAccessToken,
  parseProjectDeliveryFileAccessToken,
} from "../server/storage/project-delivery-file-access-token";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const migration = read("drizzle/0031_v33_b2_design_prototype.sql");
const schema = read("drizzle/schema.ts");
const service = read("server/services/project-design-prototype-service.ts");
const router = read("server/routers/project-design-prototype-router.ts");
const authSource = read("server/authorization/drizzle-data-source.ts");
const accessCore = read("server/_core/projectDesignPrototypeFileAccess.ts");
const appRouter = read("server/routers.ts");

type Case = { name: string; run: () => void };
const cases: Case[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });
const TEST_SECRET = "v33-b2-1-design-prototype-secret-key";

test("非项目成员不能创建设计版本", () => {
  assert.match(service, /PROJECT_MEMBERSHIP_INACTIVE/);
  assert.match(router, /project\.design_version\.create/);
});

test("versionNo 稳定递增", () => {
  assert.match(service, /const versionNo = Math\.max\(0, \.\.\.rows\.map/);
  assert.match(migration, /UNIQUE \(`projectId`,`versionNo`\)/);
});

test("requestId 重试不产生第二版本", () => {
  assert.match(migration, /design_versions_request_uq/);
  assert.match(service, /select\(\)\.from\(designVersions\)\.where\(eq\(designVersions\.requestId, requestId\)\)/);
});

test("submitted 版本不能原地修改", () => {
  assert.match(service, /if \(version\.status !== "draft"\) throw new ProjectDesignPrototypeServiceError\("RESOURCE_STATE_FORBIDDEN"\)/);
});

test("新版本提交后旧版本 superseded", () => {
  assert.match(service, /status: "superseded"/);
  assert.match(service, /previousSubmitted/);
});

test("withdrawn 不能重新提交", () => {
  assert.match(service, /if \(version\.status === "withdrawn"\) throw new ProjectDesignPrototypeServiceError\("RESOURCE_STATE_FORBIDDEN"\)/);
});

test("跨项目设计版本读取拒绝", () => {
  assert.match(service, /requireProjectActor\(tx, version\.projectId, accountId/);
});

test("文件禁用后旧令牌失效", () => {
  assert.match(service, /accessPolicyVersion: file\.accessPolicyVersion \+ 1/);
  assert.match(accessCore, /访问凭证已失效/);
});

test("currentRole 修改不能增权", () => {
  assert.doesNotMatch(router, /currentRole/);
  assert.doesNotMatch(service, /currentRole/);
});

test("无权限成员不能创建里程碑", () => {
  assert.match(router, /project\.milestone\.create/);
  assert.match(service, /PROJECT_MEMBERSHIP_INACTIVE/);
});

test("assignee 必须是有效项目成员", () => {
  assert.match(service, /requireTargetMembership/);
  assert.match(service, /MILESTONE_ASSIGNEE_INVALID/);
});

test("被移除成员不能提交成果", () => {
  assert.match(service, /PROJECT_MEMBERSHIP_INACTIVE/);
  assert.match(service, /actorCanSubmit/);
});

test("planned → in_progress → submitted 合法", () => {
  assert.match(service, /if \(milestone\.status !== "pending"\) throw new ProjectDesignPrototypeServiceError\("RESOURCE_STATE_FORBIDDEN"\)/);
  assert.match(service, /status: "in_progress"/);
  assert.match(service, /status: "submitted"/);
});

test("非返工状态不能重复提交成果", () => {
  assert.match(service, /if \(milestone\.status === "in_progress"\)/);
  assert.match(service, /else if \(milestone\.status === "submitted"\)/);
  assert.match(service, /currentLatestRound\.status !== "revision_requested"/);
});

test("重复成果提交幂等", () => {
  assert.match(migration, /milestone_deliverable_submissions_request_uq/);
  assert.match(service, /where\(eq\(milestoneDeliverableSubmissions\.requestId, requestId\)\)/);
});

test("submissionVersion 稳定递增", () => {
  assert.match(service, /const nextVersion = Math\.max\(0, \.\.\.submissionRows\.map/);
  assert.match(migration, /UNIQUE \(`milestoneId`,`submissionVersion`\)/);
});

test("submitted 后不能在 B2 阶段直接验收", () => {
  assert.doesNotMatch(router, /accept|requestRevision/);
  assert.doesNotMatch(service, /project_acceptances/);
});

test("通知失败不回滚", () => {
  assert.match(service, /Notification failure must not roll back the business transaction/);
});

test("普通项目与 idea 转换项目都能使用", () => {
  assert.match(service, /ensureLegacyProjectMembership/);
  assert.match(appRouter, /ideas: ideasRouter/);
});

test("旧项目、报价、文件和 B1 回归不受影响", () => {
  assert.match(appRouter, /ideas: ideasRouter/);
  assert.match(appRouter, /payments: paymentsRouter/);
  assert.match(appRouter, /accountProfile: accountProfileRouter/);
});

test("0031 迁移存在且只做 B2.1 最小追加", () => {
  assert.match(migration, /CREATE TABLE `design_versions`/);
  assert.match(migration, /CREATE TABLE `milestone_deliverable_submissions`/);
  assert.doesNotMatch(migration, /rfq|bom|production|presale/i);
});

test("Authorization 接入了 B2.1 capability", () => {
  assert.match(authSource, /project\.design_version\.create/);
  assert.match(authSource, /project\.milestone\.submit_deliverable/);
});

test("Router 暴露 designVersions 和 prototypeMilestones", () => {
  assert.match(appRouter, /designVersions: designVersionsRouter/);
  assert.match(appRouter, /prototypeMilestones: prototypeMilestonesRouter/);
});

test("文件令牌绑定设计版本或成果提交", () => {
  const designToken = createProjectDeliveryFileAccessToken({
    accountId: 101,
    projectId: 202,
    designVersionId: 303,
    projectFileId: 404,
    fileId: 505,
    purpose: "download",
    projectAuthorizationVersion: 1,
    entityAuthorizationVersion: 2,
    entityFileAccessPolicyVersion: 3,
    projectFileAccessPolicyVersion: 4,
    storedFileAccessPolicyVersion: 5,
    expires: Math.floor(Date.now() / 1000) + 300,
    nonce: "e89961cd-c9d3-46b0-bcee-3c26c55f4d2d",
  }, TEST_SECRET);
  const deliverableToken = createProjectDeliveryFileAccessToken({
    accountId: 101,
    projectId: 202,
    milestoneSubmissionId: 606,
    projectFileId: 404,
    fileId: 505,
    purpose: "preview",
    projectAuthorizationVersion: 1,
    entityAuthorizationVersion: 2,
    entityFileAccessPolicyVersion: 3,
    projectFileAccessPolicyVersion: 4,
    storedFileAccessPolicyVersion: 5,
    expires: Math.floor(Date.now() / 1000) + 300,
    nonce: "4516a00e-625a-4fc6-bce4-83cf19bc22cc",
  }, TEST_SECRET);
  const designClaims = parseProjectDeliveryFileAccessToken(designToken, TEST_SECRET);
  const deliverableClaims = parseProjectDeliveryFileAccessToken(deliverableToken, TEST_SECRET);
  assert.ok(designClaims?.designVersionId);
  assert.ok(deliverableClaims?.milestoneSubmissionId);
  assert.equal(designClaims?.milestoneSubmissionId, undefined);
  assert.equal(deliverableClaims?.designVersionId, undefined);
});

let passed = 0;
for (const item of cases) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}

console.log(`B2.1 backend checks passed (${passed}/${cases.length})`);
