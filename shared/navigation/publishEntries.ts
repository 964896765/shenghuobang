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
  entry({ id: "post", title: "图文", icon: "camera.fill", route: "/coming-soon?feature=图文创作", description: "图文动态与经验", enabled: false, group: "content" }),
  entry({ id: "video", title: "视频", icon: "camera.fill", route: "/coming-soon?feature=视频创作", description: "短视频内容", enabled: false, group: "content" }),
  entry({ id: "article", title: "文章", icon: "doc.text.fill", route: "/coming-soon?feature=文章创作", description: "长文与专业内容", enabled: false, group: "content" }),
  entry({ id: "question", title: "问答", icon: "questionmark.circle.fill", route: "/coming-soon?feature=问答创作", description: "提问与回答", enabled: false, group: "content" }),
  entry({ id: "review", title: "产品测评", icon: "star.fill", route: "/coming-soon?feature=产品测评", description: "可信产品测评", enabled: false, group: "content" }),
  entry({ id: "tutorial", title: "使用教程", icon: "doc.text.fill", route: "/coming-soon?feature=使用教程", description: "产品使用指南", enabled: false, group: "content" }),
  entry({ id: "idea-progress", title: "创意进展", icon: "lightbulb.fill", route: "/coming-soon?feature=创意进展", description: "同步创意进展", enabled: false, group: "content" }),
  entry({ id: "funding-progress", title: "筹措动态", icon: "banknote.fill", route: "/coming-soon?feature=筹措动态", description: "发布筹措动态", enabled: false, group: "content" }),
  entry({ id: "repair-case", title: "维修案例", icon: "wrench.fill", route: "/coming-soon?feature=维修案例", description: "沉淀维修案例", enabled: false, group: "content" }),
];
