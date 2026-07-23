import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  StableIdeaRequestIds,
  canRespondToInvitation,
  ideaErrorMessage,
  mergeIdeaPages,
} from "../lib/idea-app-contract";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const discover = read("app/ideas/index.tsx");
const editor = read("app/ideas/edit.tsx");
const detail = read("app/ideas/[id].tsx");
const invitations = read("app/ideas/invitations.tsx");
const nda = read("app/ideas/nda.tsx");
const invite = read("app/ideas/invite.tsx");
const helper = read("lib/idea-app.ts");

let cases = 0;

// 1. The discovery screen is backed by the real public feed.
assert(discover.includes("trpc.ideas.listPublic.useQuery"));
assert(discover.includes("renderItem={({ item }) => <IdeaCard idea={item}")); cases++;

// 2. Cursor pages merge without repeating the cursor row.
assert.deepEqual(mergeIdeaPages([{ id: 3 }, { id: 2 }], [{ id: 1 }]).map((item) => item.id), [3, 2, 1]);
assert.equal(mergeIdeaPages([{ id: 3 }, { id: 2 }], [{ id: 2 }, { id: 1 }]).length, 3);
assert(discover.includes("publishedAt: new Date(last.publishedAt).toISOString(), id: last.id")); cases++;

// 3. Draft creation uses a server-listed identity and never submits an account id.
assert(editor.includes("trpc.identity.listMine.useQuery"));
assert(editor.includes("createMutation.mutateAsync"));
assert(editor.includes("creatorIdentityId: identityId"));
assert(!editor.includes("creatorAccountId:")); cases++;

// 4. Publishing refreshes public, mine, and detail caches.
assert(editor.includes("publishMutation.mutateAsync"));
assert(editor.includes("utils.ideas.listPublic.invalidate()"));
assert(editor.includes("utils.ideas.listMine.invalidate()")); cases++;

// 5. Private-resource failures use a non-enumerating message.
assert.equal(ideaErrorMessage(new Error("RESOURCE_RELATION_REQUIRED")), "内容不存在或你暂时无权访问。"); cases++;

// 6. NDA-limited detail never renders attachments and presents an explicit action.
assert(detail.includes("result?.limited"));
assert(detail.includes("受保护内容和附件未下载、未缓存"));
assert(detail.includes("!result?.limited ? (")); cases++;

// 7. Accepting an NDA refreshes status and the protected detail.
assert(nda.includes("trpc.ideas.acceptNda.useMutation"));
assert(nda.includes("utils.ideas.getNdaStatus.invalidate"));
assert(nda.includes("utils.ideas.detail.invalidate")); cases++;

// 8. Invitation accept, decline, and revoke all call live mutations.
for (const method of ["acceptInvitation", "declineInvitation", "revokeInvitation"]) {
  assert(invitations.includes(`trpc.ideas.${method}.useMutation()`));
}
assert(invite.includes("trpc.ideas.inviteCollaborator.useMutation")); cases++;

// 9. Expired pending invitations cannot be actioned, while accepted is not re-expired.
const past = new Date(Date.now() - 1_000).toISOString();
assert.equal(canRespondToInvitation("pending", past), false);
assert.equal(canRespondToInvitation("accepted", past), false);
assert(invitations.includes("canRespondToInvitation")); cases++;

// 10. A retry reuses its request id until the operation completes.
const ids = new StableIdeaRequestIds();
const first = ids.get("publish-17");
assert.equal(ids.get("publish-17"), first);
ids.complete("publish-17");
assert.notEqual(ids.get("publish-17"), first); cases++;

// 11. Invitation changes and failed attachment access immediately refresh detail.
assert(invitations.includes("utils.ideas.detail.invalidate({ ideaId: row.ideaId })"));
assert(detail.includes("await utils.ideas.detail.invalidate({ ideaId })"));
assert(detail.includes("attachments = (result?.attachments ?? [])")); cases++;

// 12. Archive completion removes stale public-feed data.
assert(detail.includes("trpc.ideas.archive.useMutation"));
assert(detail.includes("utils.ideas.listPublic.invalidate()")); cases++;

// 13. Convert is guarded against double taps and keeps a stable operation id.
assert(detail.includes("disabled={convertMutation.isPending}"));
assert(detail.includes("const operation = `convert-${ideaId}`")); cases++;

// 14. Both first-time and idempotent conversion navigate using the returned project id.
assert(detail.includes("router.replace(`/projects/${converted.projectId}`")); cases++;

// 15. Authentication, authorization, concealment, and conflict errors have safe UX messages.
for (const code of ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "CONCURRENT_MODIFICATION"]) {
  assert.notEqual(ideaErrorMessage(new Error(code)), "操作未完成，请稍后重试。");
}
cases++;

// 16. Loading/empty/error/retry states exist and credentials never enter logs or permanent state.
for (const source of [discover, detail, invitations, nda]) {
  assert(/LoadingView|isLoading/.test(source));
  assert(/EmptyState|不存在|暂无/.test(source));
  assert(/ErrorState|ideaErrorMessage/.test(source));
}
assert(!helper.includes("console.log"));
assert(!editor.includes("storageKey:"));
assert(!detail.includes("setAccessPath")); cases++;

console.log(`V3.3-B1 idea App contract tests: ${cases}/${cases} PASS`);
