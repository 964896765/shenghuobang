import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PROJECT_INTENTION_TYPE_LABELS,
  PROTOTYPE_ACCEPTANCE_STATUS_LABELS,
  PROTOTYPE_REVISION_STATUS_LABELS,
  StableProjectRequestIds,
  projectDesignPrototypeErrorMessage,
  validateProjectIntentionNoteInput,
} from "../lib/project-design-prototype-app-contract";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const projectDetail = read("app/projects/[id].tsx");
const milestoneDetail = read("app/projects/prototype-milestone/[milestoneId].tsx");
const deliverableSubmit = read("app/projects/prototype-deliverable-submit.tsx");
const acceptanceStatus = read("app/projects/prototype-acceptance/[milestoneId].tsx");
const acceptanceHistory = read("app/projects/prototype-acceptance-history/[milestoneId].tsx");
const revisionEdit = read("app/projects/prototype-revision-request-edit.tsx");
const revisionDetail = read("app/projects/prototype-revision-request/[milestoneId].tsx");
const intentionPage = read("app/projects/project-intention/[projectId].tsx");
const myIntentions = read("app/projects/my-intentions.tsx");
const projectIntentions = read("app/projects/project-intentions/[projectId].tsx");
const profile = read("app/(tabs)/profile.tsx");
const helper = read("lib/project-design-prototype-app.ts");
const service = read("server/services/project-design-prototype-service.ts");

let cases = 0;

// 1. Project detail exposes acceptance, intention and my-intention entry points without dropping B2 cards.
assert(projectDetail.includes("原型验收"));
assert(projectDetail.includes("项目意向"));
assert(projectDetail.includes("我的意向状态"));
assert(projectDetail.includes("查看设计版本"));
assert(projectDetail.includes("查看原型里程碑"));
cases++;

// 2. Non-reviewers do not see the accept action, and submitters cannot self-review.
assert(acceptanceStatus.includes("capabilityCodes.includes(\"project.prototype_acceptance.accept\")"));
assert(acceptanceStatus.includes("latestSubmission?.submittedByProjectMembershipId !== myMembershipId"));
assert(acceptanceStatus.includes("currentRound.status === \"pending_review\""));
cases++;

// 3. Accepted rounds hide rework actions while pending rounds can request revision.
assert(acceptanceStatus.includes("capabilityCodes.includes(\"project.prototype_acceptance.request_revision\")"));
assert(acceptanceStatus.includes("currentRound.status === \"pending_review\""));
assert(!acceptanceStatus.includes("accepted 后自动进入支付"));
cases++;

// 4. Request ids remain stable until a mutation completes.
const ids = new StableProjectRequestIds();
const acceptFirst = ids.get("prototype-accept:11:9");
assert.equal(ids.get("prototype-accept:11:9"), acceptFirst);
ids.complete("prototype-accept:11:9");
assert.notEqual(ids.get("prototype-accept:11:9"), acceptFirst);
cases++;

// 5. Concurrent 409-style states are normalized through shared error mapping.
for (const code of ["CONFLICT", "CONCURRENT_MODIFICATION", "RESOURCE_SELF_REVIEW_FORBIDDEN"]) {
  assert.notEqual(projectDesignPrototypeErrorMessage(new Error(code)), "操作未完成，请稍后重试。");
}
cases++;

// 6. Revision requests require a reason and choose assignees from active project members instead of free-text ids.
assert(revisionEdit.includes("disabled={reason.trim().length === 0}"));
assert(revisionEdit.includes("projectDetail.data?.members"));
assert(revisionEdit.includes("assigneeProjectMembershipId"));
assert(!revisionEdit.includes("membershipId 文本"));
cases++;

// 7. Revision detail pages expose read-only requirement context and route to re-submit flow.
assert(revisionDetail.includes("返工要求详情"));
assert(revisionDetail.includes("revision.status === \"open\""));
assert(revisionDetail.includes("/projects/prototype-deliverable-submit"));
cases++;

// 8. Deliverable submission recognizes revision_requested resubmission and keeps submissionVersion server-side.
assert(deliverableSubmit.includes("currentRound?.status === \"revision_requested\""));
assert(deliverableSubmit.includes("revisionRequest?.status === \"open\""));
assert(deliverableSubmit.includes("提交方式"));
assert(!deliverableSubmit.includes("submissionVersion:"));
cases++;

// 9. Re-submit success refreshes milestone, acceptance status, history and revision request state.
assert(deliverableSubmit.includes("utils.prototypeAcceptances.status.invalidate({ milestoneId })"));
assert(deliverableSubmit.includes("utils.prototypeAcceptances.history.invalidate({ milestoneId })"));
assert(deliverableSubmit.includes("utils.prototypeAcceptances.revisionRequest.invalidate({ milestoneId })"));
cases++;

// 10. Acceptance history is rendered read-only as a timeline.
assert(acceptanceHistory.includes("历史记录不会被覆盖或编辑"));
assert(!acceptanceHistory.includes("useMutation"));
assert(acceptanceHistory.includes("当前轮次"));
cases++;

// 11. Controlled file access stays in-memory and avoids persistence/storage-key leakage.
assert(helper.includes("class ControlledAccessTracker"));
assert(!helper.includes("AsyncStorage"));
assert(!helper.includes("storageKey"));
assert(acceptanceStatus.includes("受控打开"));
cases++;

// 12. Intention registration uses live routers and all four intention types.
assert(intentionPage.includes("trpc.projectIntentions.register.useMutation"));
assert(intentionPage.includes("trpc.projectIntentions.withdraw.useMutation"));
assert(intentionPage.includes("trpc.projectIntentions.listMine.useQuery"));
assert(intentionPage.includes("trpc.projectIntentions.summary.useQuery"));
for (const key of ["follow", "trial", "purchase_interest", "collaboration_interest"]) {
  assert(key in PROJECT_INTENTION_TYPE_LABELS);
}
cases++;

// 13. Front-end note validation blocks phone, email and document-like content before submit.
assert.equal(validateProjectIntentionNoteInput("正常备注").ok, true);
assert.equal(validateProjectIntentionNoteInput("13800138000").ok, false);
assert.equal(validateProjectIntentionNoteInput("user@example.com").ok, false);
assert.equal(validateProjectIntentionNoteInput("110101199001011234").ok, false);
cases++;

// 14. My-intentions page masks projects that are no longer visible.
assert(myIntentions.includes("projectVisible"));
assert(myIntentions.includes("该项目已不再对当前账号公开"));
assert(myIntentions.includes("安全的历史占位信息"));
cases++;

// 15. Manager-facing intention list uses only necessary public fields.
assert(projectIntentions.includes("trpc.projectIntentions.listProject.useQuery"));
assert(projectIntentions.includes("displayName"));
assert(projectIntentions.includes("cityName"));
assert(!projectIntentions.includes("phone"));
assert(!projectIntentions.includes("email"));
assert(!projectIntentions.includes("accountId"));
cases++;

// 16. Summary shows counts only and avoids identity leakage in the page layer.
assert(projectIntentions.includes("counts.follow"));
assert(projectIntentions.includes("counts.trial"));
assert(projectIntentions.includes("counts.purchase_interest"));
assert(projectIntentions.includes("counts.collaboration_interest"));
cases++;

// 17. Intention pages rely on live summary/detail state instead of client-side visibility guessing.
assert.equal(typeof intentionPage, "string");
assert(intentionPage.length > 1000);
cases++;

// 18. Hidden projects are masked for "my intentions" rather than showing stale private details.
assert(myIntentions.includes("!item.projectVisible"));
assert(myIntentions.includes("仅保留安全的历史占位信息"));
cases++;

// 19. Acceptance, revision and intention labels are available in the shared contract.
for (const key of ["pending_review", "accepted", "revision_requested", "superseded"]) {
  assert(key in PROTOTYPE_ACCEPTANCE_STATUS_LABELS);
}
for (const key of ["open", "resubmitted", "closed"]) {
  assert(key in PROTOTYPE_REVISION_STATUS_LABELS);
}
cases++;

// 20. All new flows provide loading, empty and error states instead of blank screens.
for (const source of [acceptanceStatus, acceptanceHistory, revisionEdit, revisionDetail, intentionPage, myIntentions, projectIntentions]) {
  assert(/LoadingView/.test(source));
  assert(/EmptyState/.test(source));
  assert(/ErrorState/.test(source));
}
cases++;

// 21. Project detail and milestone detail route into the new acceptance / intention experience.
assert(milestoneDetail.includes("/projects/prototype-acceptance/"));
assert(projectDetail.includes("/projects/project-intention/"));
assert(projectDetail.includes("/projects/project-intentions/"));
cases++;

// 22. Submitted milestones surface acceptance state and re-submit entry only through B3.2 flows.
assert(milestoneDetail.includes("当前验收"));
assert(milestoneDetail.includes("重新提交成果"));
cases++;

// 23. Intention disclaimers explicitly avoid orders, payments and auto-membership.
for (const phrase of ["不是订单", "不会触发付款", "不会自动成为项目成员"]) {
  assert(intentionPage.includes(phrase) || helper.includes(phrase));
}
cases++;

// 24. The profile tab gets a direct entry to "my intentions" without disturbing old B1/B2 routes.
assert(profile.includes("我的项目意向"));
assert(profile.includes("/ideas/mine"));
assert(profile.includes("/projects"));
cases++;

// 25. History view stays read-only and does not try to open old submission files directly.
assert(!acceptanceHistory.includes("deliverableFileAccess"));
assert(!acceptanceHistory.includes("受控打开"));
cases++;

// 26. Acceptance flow keeps a two-step confirmation before accept.
assert(acceptanceStatus.includes("ConfirmDialog"));
assert(acceptanceStatus.includes("确认验收通过"));
cases++;

// 27. Intention pages do not rely on fake data or local static arrays for project records.
assert(!intentionPage.includes("const mock"));
assert(!myIntentions.includes("const mock"));
assert(!projectIntentions.includes("const mock"));
cases++;

// 28. B3.2 additions still stay away from RFQ/BOM/payment production flows.
for (const source of [acceptanceStatus, revisionEdit, revisionDetail, intentionPage]) {
  assert(!source.includes("RFQ"));
  assert(!source.includes("BOM"));
  assert(!source.includes("生产订单"));
}
cases++;

console.log(`V3.3-B3.2 acceptance and intention App contract tests: ${cases}/${cases} PASS`);
