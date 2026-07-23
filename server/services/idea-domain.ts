export const IDEA_NDA_VERSION = "v3.3-b1-nda-1";
export const IDEA_NDA_TEMPLATE = Object.freeze({
  title: "创意协作保密协议",
  body: "接受后，你仅可为受邀协作目的使用创意内容和附件；未经创意创建者明确许可，不得披露、复制、转授权或用于其他项目。保密义务在邀请撤销或协作结束后继续适用于已获知的受保护信息。",
});
export const IDEA_INVITATION_OPEN_STATUSES = new Set(["pending"]);
export const IDEA_VISIBLE_STATUSES = new Set(["published", "collaborating", "converted"]);

export type IdeaVisibility = "public" | "private" | "nda";
export type IdeaStatus = "draft" | "published" | "collaborating" | "converted" | "archived";
export type IdeaRequestedRole = "designer" | "engineer" | "viewer";

export function ideaInvitationDedupeKey(
  ideaId: number,
  accountId: number,
  identityId: number,
  role: IdeaRequestedRole,
): string {
  return `idea:${ideaId}:account:${accountId}:identity:${identityId}:role:${role}`;
}

export function roleIdentityType(role: IdeaRequestedRole): string | null {
  return role === "viewer" ? null : role;
}

export function requiredCertificationForRole(role: IdeaRequestedRole): string | null {
  if (role === "engineer") return "engineer_basic";
  if (role === "designer") return "real_name";
  return null;
}

export function projectRoleForIdeaRole(role: IdeaRequestedRole): "design_lead" | "engineer" | "viewer" {
  return role === "designer" ? "design_lead" : role;
}

export function ideaRequiresNda(visibility: IdeaVisibility, invitationNdaRequired = false): boolean {
  return visibility === "nda" || invitationNdaRequired;
}

export function assertIdeaTransition(from: IdeaStatus, to: IdeaStatus): void {
  const allowed: Record<IdeaStatus, readonly IdeaStatus[]> = {
    draft: ["published", "archived"],
    published: ["collaborating", "converted", "archived"],
    collaborating: ["converted", "archived"],
    converted: ["archived"],
    archived: [],
  };
  if (!allowed[from].includes(to)) throw new Error("RESOURCE_STATE_FORBIDDEN");
}

export function redactIdeaBeforeNda<T extends Record<string, unknown>>(idea: T): Partial<T> & { ndaRequired: true } {
  const { description: _description, attachments: _attachments, coverFileId: _coverFileId, ...summary } = idea;
  return { ...summary, ndaRequired: true } as Partial<T> & { ndaRequired: true };
}

export type IdeaNotificationEvent = "invited" | "accepted" | "declined" | "revoked" | "nda_accepted" | "converted";

export function ideaNotification(event: IdeaNotificationEvent, title: string) {
  const content: Record<IdeaNotificationEvent, { title: string; content: string }> = {
    invited: { title: "收到创意协作邀请", content: `你收到创意《${title}》的协作邀请。` },
    accepted: { title: "创意邀请已接受", content: `创意《${title}》的协作者已接受邀请。` },
    declined: { title: "创意邀请已拒绝", content: `创意《${title}》的协作邀请已被拒绝。` },
    revoked: { title: "创意邀请已撤销", content: `创意《${title}》的协作邀请已撤销。` },
    nda_accepted: { title: "创意保密协议已接受", content: `创意《${title}》的保密协议已接受。` },
    converted: { title: "创意已转为项目", content: `创意《${title}》已转为协作项目。` },
  };
  return content[event];
}
