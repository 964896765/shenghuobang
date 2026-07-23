export type ProductModelStatus = "draft" | "active" | "retired";

export type ProductUnitStatus =
  | "registered"
  | "manufactured"
  | "in_use"
  | "idle"
  | "listed"
  | "under_service"
  | "transferred"
  | "recycling"
  | "recycled"
  | "retired";

export type ProductTrustLevel = "self_declared" | "verified" | "certified";
export type ProductPassportVisibility = "public" | "owner" | "internal";

export const PRODUCT_MODEL_STATUS_LABELS: Record<ProductModelStatus, string> = {
  draft: "草稿",
  active: "已发布",
  retired: "已退役",
};

export const PRODUCT_UNIT_STATUS_LABELS: Record<ProductUnitStatus, string> = {
  registered: "已登记",
  manufactured: "已生产",
  in_use: "使用中",
  idle: "闲置",
  listed: "流转中",
  under_service: "维修中",
  transferred: "已转移",
  recycling: "回收中",
  recycled: "已回收",
  retired: "已退役",
};

export const PRODUCT_TRUST_LABELS: Record<ProductTrustLevel, string> = {
  self_declared: "自主声明",
  verified: "已核验",
  certified: "已认证",
};

export const PRODUCT_PASSPORT_VISIBILITY_LABELS: Record<ProductPassportVisibility, string> = {
  public: "公开",
  owner: "仅所有者",
  internal: "内部",
};

export const PRODUCT_EVENT_LABELS: Record<string, string> = {
  unit_registered: "单件登记",
  manufactured: "生产完成",
  status_changed: "状态变更",
  item_linked: "关联物品档案",
  ownership_transferred: "所有权转移",
  maintenance_recorded: "维修记录",
  inspection_recorded: "质检记录",
  recycling_started: "进入回收",
  recycled: "回收完成",
  retired: "产品退役",
};

export const PRODUCT_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  ACCOUNT_DISABLED: "当前账号不可用。",
  IDENTITY_INACTIVE: "所选业务身份已失效，请重新选择。",
  CAPABILITY_MISSING: "当前身份没有执行此操作的权限。",
  DATA_SCOPE_MISMATCH: "当前工作台不能访问该产品护照。",
  RESOURCE_RELATION_REQUIRED: "产品不存在或你暂时无权访问。",
  RESOURCE_STATE_FORBIDDEN: "当前状态不允许执行此操作。",
  PRODUCT_MODEL_NOT_FOUND: "产品型号不存在或不可见。",
  PRODUCT_UNIT_NOT_FOUND: "产品单件不存在或不可见。",
  PRODUCT_SOURCE_INACCESSIBLE: "当前账号不能使用所选来源。",
  PRODUCT_ITEM_ALREADY_LINKED: "该物品档案已关联其他产品单件。",
  CONCURRENT_MODIFICATION: "产品信息已被其他操作更新，请刷新后重试。",
  IDEMPOTENCY_CONFLICT: "该请求与此前操作不一致，请刷新后重试。",
  NEXT_OWNER_REQUIRED: "所有权转移必须指定新的所有者。",
  NEXT_OWNER_NOT_ALLOWED: "只有当前所有者可以发起所有权转移。",
  NOT_FOUND: "产品不存在或你暂时无权访问。",
  FORBIDDEN: "当前身份没有执行此操作的权限。",
  CONFLICT: "产品状态已变化，请刷新后重试。",
};

export function productErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(PRODUCT_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return PRODUCT_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  return "操作未完成，请稍后重试。";
}

function entropy(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 36);
}

export class StableProductRequestIds {
  private readonly values = new Map<string, string>();

  get(operationKey: string): string {
    const existing = this.values.get(operationKey);
    if (existing) return existing;
    const safeKey = operationKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 20) || "product";
    const value = `v4.${safeKey}.${entropy()}`.slice(0, 64);
    this.values.set(operationKey, value);
    return value;
  }

  complete(operationKey: string): void {
    this.values.delete(operationKey);
  }
}

export function formatProductDate(value: Date | string | null | undefined, includeTime = false): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", includeTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function productEventLabel(eventType: string): string {
  return PRODUCT_EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

export function describeProductEventDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return "无补充说明";
  const entries = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return entries.length > 0 ? entries.join("；") : "无补充说明";
}

export function productIntegrityLabel(integrity: { verified: boolean; visibleEventCount: number }): string {
  return integrity.verified
    ? `哈希链完整（当前视图 ${integrity.visibleEventCount} 条事件）`
    : `哈希链异常（当前视图 ${integrity.visibleEventCount} 条事件）`;
}
