import type { BadgeTone } from "./labels";

const PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  PROJECT_NOT_FOUND: "项目不存在或暂不可用。",
  DESIGN_VERSION_NOT_FOUND: "设计版本不存在或暂不可用。",
  DESIGN_VERSION_FILE_NOT_FOUND: "设计文件不存在或暂不可用。",
  MILESTONE_NOT_FOUND: "原型里程碑不存在或暂不可用。",
  PROJECT_FILE_NOT_FOUND: "文件不存在或暂不可用。",
  FILE_NOT_FOUND: "文件不存在或暂不可用。",
  DELIVERABLE_FILE_NOT_FOUND: "成果文件不存在或暂不可用。",
  DELIVERABLE_SUBMISSION_NOT_FOUND: "成果版本不存在或暂不可用。",
  ACCEPTANCE_ROUND_NOT_FOUND: "当前验收轮次不存在或已变化。",
  REVISION_REQUEST_NOT_FOUND: "返工要求不存在或暂不可用。",
  PROJECT_INTENTION_NOT_FOUND: "项目意向不存在或暂不可用。",
  PROJECT_MEMBERSHIP_INACTIVE: "你的项目成员身份已失效，请刷新后重试。",
  RESOURCE_RELATION_REQUIRED: "内容不存在或你暂时无权访问。",
  RESOURCE_SELF_REVIEW_FORBIDDEN: "提交者本人不能验收自己的成果。",
  PROJECT_INACTIVE: "项目当前不可操作。",
  CONCURRENT_MODIFICATION: "内容已被其他成员更新，请刷新后重试。",
  IDEMPOTENCY_CONFLICT: "该请求与此前操作不一致，请刷新后重试。",
  TITLE_INVALID: "请填写标题。",
  SUMMARY_INVALID: "请填写摘要。",
  DELIVERABLE_NOTE_INVALID: "请填写成果说明。",
  REVISION_REASON_INVALID: "请填写明确的返工原因。",
  REVISION_REQUIREMENTS_INVALID: "返工要求格式无效，请调整后重试。",
  INTENTION_NOTE_INVALID: "备注不能包含手机号、邮箱或证件信息。",
  TEXT_INVALID: "输入内容超出限制，请调整后重试。",
  REQUEST_ID_INVALID: "请求标识无效，请重试。",
  PROTOTYPE_MILESTONE_REQUIRED: "请选择原型里程碑。",
  MILESTONE_ASSIGNEE_INVALID: "该成员与任务类型不匹配，请重新选择。",
  MILESTONE_TASK_TYPE_INVALID: "任务类型无效。",
  DESIGN_VERSION_FILES_REQUIRED: "请至少上传一个设计文件后再提交。",
  RESOURCE_STATE_FORBIDDEN: "当前状态不允许执行此操作。",
  FORBIDDEN: "当前身份没有执行此操作的权限。",
  NOT_FOUND: "内容不存在或暂不可用。",
  CONFLICT: "内容状态已变化，请刷新后重试。",
};

function entropy(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 36);
}

export class StableProjectRequestIds {
  private readonly values = new Map<string, string>();

  get(operationKey: string): string {
    const existing = this.values.get(operationKey);
    if (existing) return existing;
    const safeKey = operationKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 20) || "b22";
    const value = `b22.${safeKey}.${entropy()}`.slice(0, 64);
    this.values.set(operationKey, value);
    return value;
  }

  complete(operationKey: string) {
    this.values.delete(operationKey);
  }
}

export function projectDesignPrototypeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  return "操作未完成，请稍后重试。";
}

export const DESIGN_VERSION_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "gray" },
  submitted: { label: "已提交", tone: "blue" },
  superseded: { label: "已被新版本替代", tone: "orange" },
  withdrawn: { label: "已撤回", tone: "gray" },
};

export const PROTOTYPE_MILESTONE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "planned", tone: "gray" },
  planned: { label: "planned", tone: "gray" },
  in_progress: { label: "in_progress", tone: "teal" },
  submitted: { label: "submitted", tone: "blue" },
};

export const PROTOTYPE_ACCEPTANCE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_review: { label: "待验收", tone: "blue" },
  accepted: { label: "已通过", tone: "green" },
  revision_requested: { label: "要求返工", tone: "orange" },
  superseded: { label: "已被新轮次替代", tone: "gray" },
};

export const PROTOTYPE_REVISION_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "待返工", tone: "orange" },
  resubmitted: { label: "已重提", tone: "blue" },
  closed: { label: "已关闭", tone: "green" },
};

export const DESIGN_FILE_ROLE_LABELS: Record<string, string> = {
  source: "源文件",
  preview: "预览图",
  reference: "参考资料",
  specification: "规格说明",
  other: "其他",
};

export const PROTOTYPE_TASK_TYPE_LABELS: Record<string, string> = {
  designer: "设计任务",
  engineer: "工程任务",
};

export const PROJECT_INTENTION_TYPE_LABELS: Record<string, string> = {
  follow: "关注",
  trial: "试用意向",
  purchase_interest: "购买意向",
  collaboration_interest: "合作意向",
};

export const PROJECT_INTENTION_DISCLAIMERS: Record<string, string> = {
  follow: "关注仅用于后续动态提醒，不会产生订单或成员关系。",
  trial: "试用意向不构成交付承诺，也不会自动安排试用计划。",
  purchase_interest: "购买意向不是订单，不会触发付款、库存锁定或预售。",
  collaboration_interest: "合作意向不会自动成为项目成员，也不会直接创建协作关系。",
};

const PHONE_PATTERN = /(?:\+?\d[\d\s-]{6,}\d)/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DOCUMENT_PATTERN = /\b\d{15,18}[0-9Xx]\b/;

export function containsSensitiveContact(value: string) {
  return PHONE_PATTERN.test(value) || EMAIL_PATTERN.test(value) || DOCUMENT_PATTERN.test(value);
}

export function validateProjectIntentionNoteInput(value: string) {
  const note = value.trim();
  if (!note) return { ok: true as const, value: "" };
  if (note.length > 500 || containsSensitiveContact(note)) {
    return { ok: false as const, value: "", message: PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES.INTENTION_NOTE_INVALID };
  }
  return { ok: true as const, value: note };
}

export function composePrototypeMilestoneDescription(input: {
  description?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  note?: string;
}) {
  const body = input.description?.trim() ?? "";
  const lines = [
    input.plannedStartAt?.trim() ? `计划开始：${input.plannedStartAt.trim()}` : "",
    input.plannedEndAt?.trim() ? `计划结束：${input.plannedEndAt.trim()}` : "",
    input.note?.trim() ? `备注：${input.note.trim()}` : "",
  ].filter(Boolean);
  return [body, ...lines].filter(Boolean).join("\n\n") || undefined;
}

export function parsePrototypeMilestoneDescription(value?: string | null) {
  const source = value?.trim() ?? "";
  if (!source) {
    return { description: "", plannedStartAt: "", plannedEndAt: "", note: "" };
  }
  const lines = source.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  let plannedStartAt = "";
  let plannedEndAt = "";
  let note = "";
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("计划开始：")) {
      plannedStartAt = line.slice("计划开始：".length).trim();
    } else if (line.startsWith("计划结束：")) {
      plannedEndAt = line.slice("计划结束：".length).trim();
    } else if (line.startsWith("备注：")) {
      note = line.slice("备注：".length).trim();
    } else {
      bodyLines.push(line);
    }
  }
  return {
    description: bodyLines.join("\n\n"),
    plannedStartAt,
    plannedEndAt,
    note,
  };
}
