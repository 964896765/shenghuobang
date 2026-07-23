export type FundingCampaignStatus =
  | "draft"
  | "reviewing"
  | "active"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "closed";

export type FundingSourceType = "need" | "idea" | "project" | "product_model";

export const FUNDING_STATUS_LABELS: Record<FundingCampaignStatus, string> = {
  draft: "草稿",
  reviewing: "待发布",
  active: "意向征集中",
  succeeded: "目标已达成",
  failed: "未达目标",
  cancelled: "已取消",
  closed: "已结束",
};

export const FUNDING_SOURCE_LABELS: Record<FundingSourceType, string> = {
  need: "需求",
  idea: "创意",
  project: "项目",
  product_model: "产品型号",
};

export const FUNDING_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  ACCOUNT_DISABLED: "当前账号不可用。",
  IDENTITY_INACTIVE: "所选业务身份已失效，请重新选择。",
  CAPABILITY_MISSING: "当前身份没有执行此操作的权限。",
  DATA_SCOPE_MISMATCH: "当前工作台不能访问该筹措活动。",
  RESOURCE_RELATION_REQUIRED: "筹措活动不存在或你暂时无权访问。",
  RESOURCE_STATE_FORBIDDEN: "当前状态不允许执行此操作。",
  CAMPAIGN_SOURCE_FORBIDDEN: "当前账号不能使用该来源发起筹措。",
  CAMPAIGN_SOURCE_ALREADY_ACTIVE: "该来源已有进行中的筹措活动。",
  CAMPAIGN_SELF_PLEDGE_FORBIDDEN: "发起人不能给自己的活动登记支持意向。",
  CAMPAIGN_EVIDENCE_REQUIRED: "发布前至少需要一项可核验依据。",
  CAMPAIGN_END_DATE_REQUIRED: "发布前需要设置意向征集截止时间。",
  CAMPAIGN_NOT_OPEN: "该活动当前不接受新的支持意向。",
  CAMPAIGN_GOAL_NOT_REACHED: "当前支持数量尚未达到目标，不能标记为成功。",
  PLEDGE_ALREADY_ACTIVE: "你已登记过支持意向，可先撤回后重新登记。",
  CONCURRENT_MODIFICATION: "活动已被其他操作更新，请刷新后重试。",
  IDEMPOTENCY_CONFLICT: "该请求与此前操作不一致，请刷新后重试。",
  NOT_FOUND: "筹措活动不存在或你暂时无权访问。",
  FORBIDDEN: "当前身份没有执行此操作的权限。",
  CONFLICT: "活动状态已变化，请刷新后重试。",
};

export function fundingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(FUNDING_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return FUNDING_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  return "操作未完成，请稍后重试。";
}

function entropy(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 36);
}

export class StableFundingRequestIds {
  private readonly values = new Map<string, string>();

  get(operationKey: string): string {
    const existing = this.values.get(operationKey);
    if (existing) return existing;
    const safeKey = operationKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 20) || "funding";
    const value = `v4.${safeKey}.${entropy()}`.slice(0, 64);
    this.values.set(operationKey, value);
    return value;
  }

  complete(operationKey: string): void {
    this.values.delete(operationKey);
  }
}

export function fundingProgress(pledgedQuantity: number, goalQuantity: number): number {
  if (!Number.isFinite(goalQuantity) || goalQuantity <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((pledgedQuantity / goalQuantity) * 100)));
}

export function formatFundingDate(value: Date | string | null | undefined): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未设置";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
