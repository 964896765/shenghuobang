import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createIdeaCollaboratorTargetToken,
  matchesIdeaCollaboratorTargetScope,
  matchesIdeaCollaboratorTargetState,
  parseIdeaCollaboratorTargetToken,
} from "../server/storage/idea-collaborator-target-token";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const routerSource = read("server/routers/ideas-router.ts");
const serviceSource = read("server/services/idea-service.ts");
const invitePageSource = read("app/ideas/invite.tsx");
const TEST_SECRET = "v33-b1-1-collaborator-search-secret-key";
type Case = { name: string; run: () => void };
const cases: Case[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });

test("未登录不能搜索", () => {
  assert.match(routerSource, /searchCollaborators:\s*protectedProcedure/);
});

test("空查询不能枚举", () => {
  assert.match(routerSource, /query:\s*z\.string\(\)\.trim\(\)\.min\(2\)\.max\(50\)/);
});

test("1 字符查询拒绝", () => {
  assert.match(serviceSource, /if \(query\.length < 2 \|\| query\.length > 50\) throw new IdeaServiceError\("SEARCH_QUERY_INVALID"\)/);
});

test("只返回 active account 和 identity", () => {
  assert.match(serviceSource, /eq\(users\.accountStatus, "active"\)/);
  assert.match(serviceSource, /eq\(businessIdentities\.status, "active"\)/);
});

test("designer 结果类型正确", () => {
  assert.match(serviceSource, /const requiredType = roleIdentityType\(options\.requestedRole\)/);
  assert.match(serviceSource, /requiredType \? eq\(identityTypes\.code, requiredType\) : undefined/);
});

test("engineer 必须认证有效", () => {
  assert.match(serviceSource, /const certificationCode = requiredCertificationForRole\(options\.requestedRole\)/);
  assert.match(serviceSource, /eq\(certifications\.status, "approved"\)/);
  assert.match(serviceSource, /gt\(certifications\.expiresAt, now\)/);
});

test("认证撤销后不返回", () => {
  assert.match(serviceSource, /if \(certificationCode && !certification\) continue;/);
});

test("搜索结果不返回 accountId", () => {
  assert.match(serviceSource, /displayName:\s*textValue/);
  assert.match(serviceSource, /avatarUrl:\s*textValue/);
  assert.match(serviceSource, /identityType:\s*textValue/);
  assert.match(serviceSource, /professionalTitle:\s*textValue/);
  assert.match(serviceSource, /publicSkills:\s*textList/);
  assert.match(serviceSource, /publicCategory,/);
  assert.match(serviceSource, /cityName:\s*textValue/);
  assert.match(serviceSource, /certificationBadge,/);
  assert.match(serviceSource, /invitationTargetToken:\s*createIdeaCollaboratorTargetToken/);
  assert.doesNotMatch(invitePageSource, /accountId/);
});

test("搜索结果不返回 identityId", () => {
  assert.match(serviceSource, /return \{\s*items: eligible,\s*nextCursor:/);
  assert.doesNotMatch(invitePageSource, /identityId/);
});

test("搜索结果不返回手机号和邮箱", () => {
  assert.match(serviceSource, /const emailQuery =/);
  assert.match(serviceSource, /const phoneQuery =/);
  assert.match(serviceSource, /queryLooksSensitive/);
});

test("token 不能跨账号", () => {
  const token = createIdeaCollaboratorTargetToken({
    searcherAccountId: 101,
    targetAccountId: 202,
    targetIdentityId: 303,
    requestedRole: "designer",
    ideaId: 404,
    identityStatus: "active",
    identityVersion: 5,
    certificationStatus: "approved",
    certificationVersion: 7,
    expires: Math.floor(Date.now() / 1000) + 600,
    nonce: "5b8e6302-59e6-4ec3-b535-e50b1e833dde",
  }, TEST_SECRET);
  const claims = parseIdeaCollaboratorTargetToken(token, TEST_SECRET);
  assert.ok(claims);
  assert.equal(matchesIdeaCollaboratorTargetScope(claims, { searcherAccountId: 999, ideaId: 404, requestedRole: "designer" }), false);
});

test("token 不能跨角色", () => {
  const token = createIdeaCollaboratorTargetToken({
    searcherAccountId: 101,
    targetAccountId: 202,
    targetIdentityId: 303,
    requestedRole: "designer",
    ideaId: 404,
    identityStatus: "active",
    identityVersion: 5,
    certificationStatus: "approved",
    certificationVersion: 7,
    expires: Math.floor(Date.now() / 1000) + 600,
    nonce: "f1f4ecb9-0582-4c95-b40f-b9b6472a09f1",
  }, TEST_SECRET);
  const claims = parseIdeaCollaboratorTargetToken(token, TEST_SECRET);
  assert.ok(claims);
  assert.equal(matchesIdeaCollaboratorTargetScope(claims, { searcherAccountId: 101, ideaId: 404, requestedRole: "engineer" }), false);
});

test("token 不能跨 idea", () => {
  const token = createIdeaCollaboratorTargetToken({
    searcherAccountId: 101,
    targetAccountId: 202,
    targetIdentityId: 303,
    requestedRole: "designer",
    ideaId: 404,
    identityStatus: "active",
    identityVersion: 5,
    certificationStatus: "approved",
    certificationVersion: 7,
    expires: Math.floor(Date.now() / 1000) + 600,
    nonce: "4036e34b-a338-4376-a66c-e57b26778884",
  }, TEST_SECRET);
  const claims = parseIdeaCollaboratorTargetToken(token, TEST_SECRET);
  assert.ok(claims);
  assert.equal(matchesIdeaCollaboratorTargetScope(claims, { searcherAccountId: 101, ideaId: 505, requestedRole: "designer" }), false);
});

test("token 过期拒绝", () => {
  const now = Date.now();
  const token = createIdeaCollaboratorTargetToken({
    searcherAccountId: 101,
    targetAccountId: 202,
    targetIdentityId: 303,
    requestedRole: "designer",
    ideaId: 404,
    identityStatus: "active",
    identityVersion: 5,
    certificationStatus: "approved",
    certificationVersion: 7,
    expires: Math.floor(now / 1000) + 1,
    nonce: "f0f54f43-4f73-45a0-9a6f-a2228ddab3ce",
  }, TEST_SECRET);
  assert.equal(parseIdeaCollaboratorTargetToken(token, TEST_SECRET, now + 2_000), null);
});

test("身份撤销后旧 token 拒绝", () => {
  const token = createIdeaCollaboratorTargetToken({
    searcherAccountId: 101,
    targetAccountId: 202,
    targetIdentityId: 303,
    requestedRole: "engineer",
    ideaId: 404,
    identityStatus: "active",
    identityVersion: 5,
    certificationStatus: "approved",
    certificationVersion: 7,
    expires: Math.floor(Date.now() / 1000) + 600,
    nonce: "89043692-1837-4719-9878-33afd7de9832",
  }, TEST_SECRET);
  const claims = parseIdeaCollaboratorTargetToken(token, TEST_SECRET);
  assert.ok(claims);
  assert.equal(matchesIdeaCollaboratorTargetState(claims, {
    identityStatus: "revoked",
    identityVersion: 6,
    certificationStatus: "approved",
    certificationVersion: 7,
  }), false);
});

test("重复邀请保持幂等", () => {
  assert.match(serviceSource, /const \[byRequest\] = await tx\.select\(\)\.from\(ideaCollaborationInvitations\)\.where\(eq\(ideaCollaborationInvitations\.requestId, input\.requestId\)\)\.limit\(1\);/);
  assert.match(serviceSource, /if \(existing\)\s*return \{ idea, invitation: existing, duplicate: true \};/);
});

test("App 不再出现账号 ID 和身份 ID 输入框", () => {
  assert.doesNotMatch(invitePageSource, /受邀账号 ID/);
  assert.doesNotMatch(invitePageSource, /业务身份 ID/);
  assert.match(invitePageSource, /搜索协作者/);
});

test("搜索 loading\/empty\/error 正常", () => {
  assert.match(invitePageSource, /LoadingView/);
  assert.match(invitePageSource, /EmptyState/);
  assert.match(invitePageSource, /ErrorState/);
});

test("邀请成功后刷新发出邀请列表", () => {
  assert.match(invitePageSource, /utils\.ideas\.listInvitations\.invalidate\(\{ direction: "sent", ideaId, limit: 50 \}\)/);
});

let passed = 0;
for (const item of cases) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}

console.log(`B1.1 collaborator search checks passed (${passed}/${cases.length})`);
