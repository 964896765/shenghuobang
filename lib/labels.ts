/** 状态与业务枚举的中文标签、颜色映射 */

export const NEED_TYPES = [
  { value: "life", label: "生活问题" },
  { value: "engineering", label: "工程设计" },
  { value: "product", label: "产品创意" },
  { value: "software", label: "软件需求" },
  { value: "repair", label: "维修需求" },
  { value: "renovation", label: "改造需求" },
  { value: "consulting", label: "技术咨询" },
  { value: "other", label: "其他" },
];

export const needTypeLabel = (v?: string | null) =>
  NEED_TYPES.find((t) => t.value === v)?.label ?? "其他";

export type BadgeTone = "gray" | "green" | "teal" | "orange" | "yellow" | "red" | "blue";

export const NEED_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "gray" },
  pending_review: { label: "待审核", tone: "yellow" },
  published: { label: "已发布", tone: "green" },
  collecting_solutions: { label: "收集方案中", tone: "teal" },
  selecting_quote: { label: "选择报价中", tone: "teal" },
  project_created: { label: "已建项目", tone: "blue" },
  solved: { label: "已解决", tone: "green" },
  closed: { label: "已关闭", tone: "gray" },
  rejected: { label: "未通过", tone: "red" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "已提交", tone: "teal" },
  viewed: { label: "已查看", tone: "teal" },
  negotiating: { label: "协商中", tone: "yellow" },
  accepted: { label: "已接受", tone: "green" },
  rejected: { label: "已拒绝", tone: "red" },
  withdrawn: { label: "已撤回", tone: "gray" },
  expired: { label: "已过期", tone: "gray" },
  not_selected: { label: "未选中", tone: "gray" },
};

export const PROJECT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_confirmation: { label: "待确认", tone: "yellow" },
  pending_agreement: { label: "待签署", tone: "yellow" },
  pending_payment: { label: "待托管首款", tone: "orange" },
  in_progress: { label: "进行中", tone: "teal" },
  waiting_acceptance: { label: "待验收", tone: "blue" },
  revision: { label: "修改中", tone: "yellow" },
  paused: { label: "已暂停", tone: "gray" },
  disputed: { label: "争议中", tone: "red" },
  completed: { label: "已完成", tone: "green" },
  cancelled: { label: "已取消", tone: "gray" },
  refunded: { label: "已退款", tone: "gray" },
  closed: { label: "已关闭", tone: "gray" },
};

export const MILESTONE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "未开始", tone: "gray" },
  in_progress: { label: "进行中", tone: "teal" },
  submitted: { label: "已提交", tone: "blue" },
  waiting_acceptance: { label: "待验收", tone: "blue" },
  revision_required: { label: "需修改", tone: "yellow" },
  accepted: { label: "已通过", tone: "green" },
  overdue: { label: "已逾期", tone: "red" },
  disputed: { label: "争议中", tone: "red" },
  cancelled: { label: "已取消", tone: "gray" },
};

export const LISTING_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "gray" },
  published: { label: "在售", tone: "green" },
  reserved: { label: "交易中", tone: "orange" },
  completed: { label: "已成交", tone: "blue" },
  closed: { label: "已下架", tone: "gray" },
};

export const SWAP_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "等待对方处理", tone: "teal" },
  awaiting_confirmations: { label: "等待双方确认", tone: "orange" },
  rejected: { label: "已拒绝", tone: "gray" },
  cancelled: { label: "已取消", tone: "gray" },
  completed: { label: "置换完成", tone: "green" },
};

export const OFFER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "已出价", tone: "teal" },
  negotiating: { label: "协商中", tone: "yellow" },
  accepted: { label: "已接受", tone: "green" },
  rejected: { label: "已拒绝", tone: "red" },
  withdrawn: { label: "已撤回", tone: "gray" },
  expired: { label: "已过期", tone: "gray" },
  not_selected: { label: "未选中", tone: "gray" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_confirmation: { label: "待确认", tone: "yellow" },
  pending_payment: { label: "待支付", tone: "orange" },
  paid: { label: "已支付", tone: "teal" },
  pending_delivery: { label: "待交付", tone: "teal" },
  pending_acceptance: { label: "待收货确认", tone: "blue" },
  completed: { label: "已完成", tone: "green" },
  cancelled: { label: "已取消", tone: "gray" },
  refunding: { label: "退款中", tone: "yellow" },
  refunded: { label: "已退款", tone: "gray" },
  disputed: { label: "争议中", tone: "red" },
  closed: { label: "已关闭", tone: "gray" },
};

export const RECYCLING_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  quoting: { label: "询价中", tone: "teal" },
  quoted: { label: "已有报价", tone: "blue" },
  selected: { label: "已选商家", tone: "orange" },
  inspecting: { label: "检测中", tone: "yellow" },
  completed: { label: "已完成", tone: "green" },
  cancelled: { label: "已取消", tone: "gray" },
};

export const RECYCLING_QUOTE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "已报价", tone: "teal" },
  selected: { label: "已选中", tone: "green" },
  not_selected: { label: "未选中", tone: "gray" },
  withdrawn: { label: "已撤回", tone: "gray" },
  adjusted: { label: "已调价", tone: "yellow" },
  confirmed: { label: "已确认", tone: "green" },
};

export const GIVEAWAY_APP_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "已申请", tone: "teal" },
  selected: { label: "已获得", tone: "green" },
  rejected: { label: "未获得", tone: "gray" },
  withdrawn: { label: "已撤回", tone: "gray" },
};

export const LISTING_MODES = [
  { value: "fixed_price", label: "一口价" },
  { value: "accept_offers", label: "接受报价" },
  { value: "swap", label: "置换" },
  { value: "giveaway", label: "免费赠送" },
  { value: "recycle", label: "商家回收" },
];

export const modeLabel = (v?: string | null) => LISTING_MODES.find((m) => m.value === v)?.label ?? v ?? "";

export const CONDITION_LEVELS = ["全新", "几乎全新", "九成新", "八成新", "七成新", "明显使用痕迹", "仅适合回收"];
export const FUNCTION_STATUSES = ["功能正常", "部分功能异常", "无法使用", "未测试"];

export const ITEM_CATEGORIES = ["家电", "数码", "家具", "母婴", "图书", "服饰", "运动", "工具", "其他"];
export const NEED_CATEGORIES = ["家电维修", "水电安装", "软件开发", "产品设计", "结构设计", "电子硬件", "家居改造", "技术咨询", "其他"];
export const ENGINEER_CATEGORIES = ["软件开发", "电子硬件", "机械结构", "产品设计", "家电维修", "水电工程", "家居改造", "自动化", "其他"];

export const creditLevel = (score: number) => {
  if (score >= 100) return { label: "信用良好", tone: "green" as BadgeTone };
  if (score >= 80) return { label: "信用正常", tone: "teal" as BadgeTone };
  if (score >= 60) return { label: "信用需关注", tone: "yellow" as BadgeTone };
  return { label: "高风险", tone: "red" as BadgeTone };
};

export const REVIEW_DIMENSIONS_SERVICE = [
  { key: "professional", label: "专业能力" },
  { key: "understanding", label: "需求理解" },
  { key: "quality", label: "交付质量" },
  { key: "punctuality", label: "准时程度" },
  { key: "communication", label: "沟通体验" },
];

export const REVIEW_DIMENSIONS_TRADE = [
  { key: "accuracy", label: "描述准确" },
  { key: "attitude", label: "沟通态度" },
  { key: "speed", label: "交付速度" },
  { key: "condition", label: "物品状态" },
];

export function formatTime(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatPrice(v?: number | null) {
  if (v === null || v === undefined) return "-";
  return `¥${v}`;
}
