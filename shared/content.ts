export const CONTENT_TYPE_OPTIONS = [
  { value: "post", label: "图文" },
  { value: "video", label: "视频" },
  { value: "article", label: "文章" },
  { value: "question", label: "问答" },
  { value: "product_review", label: "产品测评" },
  { value: "tutorial", label: "使用教程" },
  { value: "idea_progress", label: "创意进展" },
  { value: "funding_update", label: "筹措动态" },
  { value: "repair_case", label: "维修案例" },
] as const;

export type ContentType = typeof CONTENT_TYPE_OPTIONS[number]["value"];

export const CONTENT_SOURCE_OPTIONS = [
  { value: "personal_experience", label: "个人经验", help: "来自作者本人的使用或实践经验" },
  { value: "organization_official", label: "组织官方", help: "由已选择的组织上下文发布" },
  { value: "service_case", label: "服务案例", help: "来自真实服务过程的案例总结" },
  { value: "external_public", label: "公开资料", help: "基于可公开查证的外部资料整理" },
  { value: "ai_assisted", label: "AI 辅助整理", help: "AI 仅做整理，内容须由作者确认" },
  { value: "unverified_claim", label: "未经核验的声明", help: "平台尚未核验该项主张" },
] as const;

export type ContentSourceType = typeof CONTENT_SOURCE_OPTIONS[number]["value"];

export const SOURCE_LABELS: Record<string, string> = {
  personal_experience: "个人经验",
  organization_official: "组织官方",
  service_case: "服务案例",
  platform_verified: "平台已核验",
  external_public: "公开资料",
  ai_assisted: "AI 辅助整理（作者已确认）",
  unverified_claim: "未经平台核验",
};

export const RELATION_LABELS: Record<string, string> = {
  demand: "需求",
  idea: "创意",
  funding_project: "新品筹措",
  product: "产品",
  product_unit: "产品护照",
  listing: "商品",
  repair: "维修需求",
  service: "服务商",
  donation: "捐赠",
  recycling: "回收",
  account: "作者",
  organization: "组织",
};

export function contentTypeLabel(value: string) {
  return CONTENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function newContentRequestId(operation: string) {
  return `content:${operation}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);
}
