import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DESIGN_VERSION_STATUS_LABELS,
  PROTOTYPE_MILESTONE_STATUS_LABELS,
  StableProjectRequestIds,
  composePrototypeMilestoneDescription,
  parsePrototypeMilestoneDescription,
  projectDesignPrototypeErrorMessage,
} from "../lib/project-design-prototype-app-contract";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const projectDetail = read("app/projects/[id].tsx");
const designList = read("app/projects/design-versions/[projectId].tsx");
const designEdit = read("app/projects/design-version-edit.tsx");
const designDetail = read("app/projects/design-version/[designVersionId].tsx");
const milestoneList = read("app/projects/prototype-milestones/[projectId].tsx");
const milestoneEdit = read("app/projects/prototype-milestone-edit.tsx");
const milestoneDetail = read("app/projects/prototype-milestone/[milestoneId].tsx");
const deliverableSubmit = read("app/projects/prototype-deliverable-submit.tsx");
const helper = read("lib/project-design-prototype-app.ts");

let cases = 0;

// 1. Project detail exposes design and prototype entry points without removing legacy sections.
assert(projectDetail.includes("查看设计版本"));
assert(projectDetail.includes("查看原型里程碑"));
assert(projectDetail.includes("文件 ${files.length}"));
assert(projectDetail.includes("变更 ${changes.length}"));
cases++;

// 2. Both ordinary and converted projects share the same project-detail entry flow.
assert(projectDetail.includes("router.push(`/projects/design-versions/${project.id}`"));
assert(projectDetail.includes("router.push(`/projects/prototype-milestones/${project.id}`"));
assert(!projectDetail.includes("sourceIdeaId"));
cases++;

// 3. Design version status labels cover draft/submitted/superseded/withdrawn.
for (const key of ["draft", "submitted", "superseded", "withdrawn"]) {
  assert(key in DESIGN_VERSION_STATUS_LABELS);
}
assert(designList.includes("当前版本"));
cases++;

// 4. Creating a draft uses the live designVersions router.
assert(designEdit.includes("trpc.designVersions.createDraft.useMutation"));
assert(designEdit.includes("trpc.designVersions.updateDraft.useMutation"));
assert(designEdit.includes("trpc.designVersions.uploadFile.useMutation"));
cases++;

// 5. Stable request ids are reused until completion.
const ids = new StableProjectRequestIds();
const first = ids.get("design-submit:7");
assert.equal(ids.get("design-submit:7"), first);
ids.complete("design-submit:7");
assert.notEqual(ids.get("design-submit:7"), first);
cases++;

// 6. Submitted versions have no edit path and only draft versions can submit.
assert(designList.includes('const editable = item.status === "draft" && canEdit;'));
assert(designList.includes('const submittable = item.status === "draft" && canSubmit;'));
assert(designDetail.includes('const editable = data.version.status === "draft" && capabilities.includes("project.design_version.edit");'));
cases++;

// 7. Superseded and withdrawn versions are rendered read-only.
assert(designList.includes('item.status === "superseded"'));
assert(designList.includes('item.status === "withdrawn"'));
assert(designEdit.includes("已提交、已替代或已撤回的设计版本都只读"));
cases++;

// 8. Design file uploads bind to the current version and disabled files stop opening.
assert(designEdit.includes("designVersionId: targetId"));
assert(designEdit.includes('file.status !== "disabled"'));
assert(designDetail.includes('file.status === "disabled"'));
cases++;

// 9. Short-lived controlled links are opened in memory and not persisted.
assert(helper.includes("class ControlledAccessTracker"));
assert(!helper.includes("AsyncStorage"));
assert(!helper.includes("setItem("));
assert(!helper.includes("storageKey"));
cases++;

// 10. Milestone creation and editing rely on active project members instead of free-text ids.
assert(milestoneEdit.includes("projectDetail.data?.members"));
assert(milestoneEdit.includes("compatibleMembers"));
assert(!milestoneEdit.includes("membershipId 文本"));
cases++;

// 11. Planned milestones can start and in-progress milestones can submit deliverables.
assert(milestoneList.includes('const startable = item.status === "planned" && canStart;'));
assert(milestoneList.includes('const submittable = item.status === "in_progress" && canSubmit;'));
assert(milestoneDetail.includes('detail.data.milestone.status === "in_progress" && canSubmit'));
cases++;

// 12. Submitted milestones do not expose acceptance or rework actions in B2.2.
for (const source of [milestoneList, milestoneDetail, deliverableSubmit]) {
  assert(!source.includes("验收"));
  assert(!source.includes("返工"));
}
cases++;

// 13. Deliverable submission calls the live routers and prevents duplicate pending clicks.
assert(deliverableSubmit.includes("trpc.projects.uploadFile.useMutation"));
assert(deliverableSubmit.includes("trpc.prototypeMilestones.submitDeliverable.useMutation"));
assert(deliverableSubmit.includes("loading={submitMutation.isPending}"));
cases++;

// 14. Successful deliverable submission refreshes prototype state and routes back to detail.
assert(deliverableSubmit.includes("utils.prototypeMilestones.detail.invalidate({ milestoneId })"));
assert(deliverableSubmit.includes("utils.prototypeMilestones.list.invalidate({ projectId })"));
assert(deliverableSubmit.includes("router.replace(`/projects/prototype-milestone/${milestoneId}`"));
cases++;

// 15. Common API errors map to non-leaking messages.
for (const code of ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "CONCURRENT_MODIFICATION"]) {
  assert.notEqual(projectDesignPrototypeErrorMessage(new Error(code)), "操作未完成，请稍后重试。");
}
cases++;

// 16. Empty/loading/error states exist across all new flows.
for (const source of [designList, designEdit, designDetail, milestoneList, milestoneEdit, milestoneDetail, deliverableSubmit]) {
  assert(/LoadingView/.test(source));
  assert(/EmptyState/.test(source));
  assert(/ErrorState/.test(source));
}
cases++;

// 17. Prototype scheduling metadata round-trips through the app helper.
const composed = composePrototypeMilestoneDescription({
  description: "完成外观原型",
  plannedStartAt: "2026-07-25 09:00",
  plannedEndAt: "2026-07-28 18:00",
  note: "需同步工程评审",
});
assert.equal(parsePrototypeMilestoneDescription(composed).plannedStartAt, "2026-07-25 09:00");
assert.equal(parsePrototypeMilestoneDescription(composed).plannedEndAt, "2026-07-28 18:00");
assert.equal(parsePrototypeMilestoneDescription(composed).note, "需同步工程评审");
cases++;

// 18. Helper labels use planned/in_progress/submitted and keep B2.2 away from acceptance states.
for (const key of ["planned", "in_progress", "submitted"]) {
  assert(key in PROTOTYPE_MILESTONE_STATUS_LABELS);
}
assert.equal(PROTOTYPE_MILESTONE_STATUS_LABELS.planned.label, "planned");
cases++;

// 19. Controlled-access cleanup is available when a page exits.
assert(helper.includes("async cleanup(): Promise<void>"));
cases++;

// 20. Project detail gains B2.2 features without touching B1 idea routes.
assert(projectDetail.includes("联系"));
assert(!projectDetail.includes("ideas.searchCollaborators"));
cases++;

console.log(`V3.3-B2.2 design prototype App contract tests: ${cases}/${cases} PASS`);
