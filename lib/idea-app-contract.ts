export type IdeaInvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

export const IDEA_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  ACCOUNT_INACTIVE: "当前账号不可用。",
  IDENTITY_INACTIVE: "所选业务身份已失效，请重新选择。",
  CERTIFICATION_INACTIVE: "该身份认证未通过、已过期或已撤销。",
  CAPABILITY_MISSING: "当前身份没有执行此操作的权限。",
  DATA_SCOPE_MISMATCH: "当前工作台不能访问该内容。",
  RESOURCE_RELATION_REQUIRED: "内容不存在或你暂时无权访问。",
  RESOURCE_STATE_FORBIDDEN: "当前状态不允许执行此操作。",
  CONFIDENTIALITY_TOO_HIGH: "当前身份的保密级别不足。",
  NDA_REQUIRED: "接受保密协议后才能查看完整内容。",
  INVITATION_EXPIRED: "邀请已过期，不能继续操作。",
  CONCURRENT_MODIFICATION: "内容已被其他操作更新，请刷新后重试。",
  IDEMPOTENCY_CONFLICT: "该请求与此前操作不一致，请刷新后重试。",
  NOT_FOUND: "内容不存在或你暂时无权访问。",
  FORBIDDEN: "当前身份没有执行此操作的权限。",
  CONFLICT: "内容状态已变化，请刷新后重试。",
};

export function ideaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(IDEA_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return IDEA_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  return "操作未完成，请稍后重试。";
}

function entropy(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 36);
}

export class StableIdeaRequestIds {
  private readonly values = new Map<string, string>();

  get(operationKey: string): string {
    const existing = this.values.get(operationKey);
    if (existing) return existing;
    const safeKey = operationKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 20) || "idea";
    const value = `b1.${safeKey}.${entropy()}`.slice(0, 64);
    this.values.set(operationKey, value);
    return value;
  }

  complete(operationKey: string): void {
    this.values.delete(operationKey);
  }
}

export function mergeIdeaPages<T extends { id: number }>(current: readonly T[], next: readonly T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  next.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

export function effectiveInvitationStatus(status: IdeaInvitationStatus, expiresAt: Date | string): IdeaInvitationStatus {
  return status === "pending" && new Date(expiresAt).getTime() <= Date.now() ? "expired" : status;
}

export function canRespondToInvitation(status: IdeaInvitationStatus, expiresAt: Date | string): boolean {
  return effectiveInvitationStatus(status, expiresAt) === "pending";
}
