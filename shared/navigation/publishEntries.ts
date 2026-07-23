import { ALL_NAVIGATION_ROLES, type AppEntry } from "./appNavigation";

const entry = (value: Omit<AppEntry, "supportedRoles" | "requiredCapabilities" | "locationAware"> & Partial<Pick<AppEntry, "locationAware">>): AppEntry => ({
  ...value,
  supportedRoles: ALL_NAVIGATION_ROLES,
  requiredCapabilities: [],
  locationAware: value.locationAware ?? false,
  requiresAuth: true,
});

export const PUBLISH_ENTRIES: readonly AppEntry[] = [
  entry({ id: "need", title: "需求", icon: "list.bullet.rectangle.fill", route: "/needs/create", description: "发布生活与服务需求", enabled: true, group: "business", locationAware: true }),
  entry({ id: "idea", title: "创意", icon: "lightbulb.fill", route: "/ideas/edit", description: "发起创意与共创", enabled: true, group: "business" }),
  entry({ id: "product", title: "产品", icon: "cube.box.fill", route: "/products/new", description: "创建可信产品档案", enabled: true, group: "business" }),
  entry({ id: "secondhand", title: "二手", icon: "tag.fill", route: "/listings/create?mode=secondhand", description: "发布闲置物品", enabled: true, group: "business", locationAware: true }),
  entry({ id: "repair", title: "维修需求", icon: "wrench.fill", route: "/needs/create?type=repair", description: "发布维修需求", enabled: true, group: "business", locationAware: true }),
  entry({ id: "donation", title: "捐赠", icon: "gift.fill", route: "/listings/create?mode=giveaway", description: "发布免费赠送物品", enabled: true, group: "business", locationAware: true }),
  entry({ id: "recycling", title: "回收", icon: "arrow.3.trianglepath", route: "/recycling/create", description: "发布回收请求", enabled: true, group: "business", locationAware: true }),
  entry({ id: "post", title: "图文", icon: "camera.fill", route: "/content/create?type=post", description: "分享图文动态与真实经验", enabled: true, group: "content" }),
  entry({ id: "video", title: "视频", icon: "camera.fill", route: "/content/create?type=video", description: "发布短视频内容", enabled: true, group: "content" }),
  entry({ id: "article", title: "文章", icon: "doc.text.fill", route: "/content/create?type=article", description: "发布长文与专业内容", enabled: true, group: "content" }),
  entry({ id: "question", title: "问答", icon: "questionmark.circle.fill", route: "/content/create?type=question", description: "提出问题或分享回答", enabled: true, group: "content" }),
  entry({ id: "review", title: "产品测评", icon: "star.fill", route: "/content/create?type=product_review", description: "关联产品发布真实测评", enabled: true, group: "content" }),
  entry({ id: "tutorial", title: "使用教程", icon: "doc.text.fill", route: "/content/create?type=tutorial", description: "发布产品使用指南", enabled: true, group: "content" }),
  entry({ id: "idea-progress", title: "创意进展", icon: "lightbulb.fill", route: "/content/create?type=idea_progress", description: "同步已关联创意的进展", enabled: true, group: "content" }),
  entry({ id: "funding-progress", title: "筹措动态", icon: "banknote.fill", route: "/content/create?type=funding_update", description: "发布新品筹措动态", enabled: true, group: "content" }),
  entry({ id: "repair-case", title: "维修案例", icon: "wrench.fill", route: "/content/create?type=repair_case", description: "沉淀可复用维修案例", enabled: true, group: "content" }),
];
