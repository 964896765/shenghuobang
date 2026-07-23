import { ALL_NAVIGATION_ROLES, type AppEntry } from "./appNavigation";

const make = (value: Omit<AppEntry, "supportedRoles" | "requiredCapabilities" | "locationAware">): AppEntry => ({
  ...value, supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: false, requiresAuth: true,
});

export const PROFILE_ENTRIES: readonly AppEntry[] = [
  make({ id: "orders", title: "订单", icon: "creditcard.fill", route: "/orders", description: "购买与服务订单", enabled: true, group: "business" }),
  make({ id: "needs", title: "需求", icon: "list.bullet.rectangle.fill", route: "/my-needs", description: "我发布的需求", enabled: true, group: "business" }),
  make({ id: "ideas", title: "创意", icon: "lightbulb.fill", route: "/ideas/mine", description: "我发起和参与的创意", enabled: true, group: "business" }),
  make({ id: "funding", title: "筹措", icon: "banknote.fill", route: "/funding/mine", description: "我发起和支持的筹措", enabled: true, group: "business" }),
  make({ id: "products", title: "产品", icon: "cube.box.fill", route: "/products/mine", description: "我的产品型号与实物", enabled: true, group: "business" }),
  make({ id: "services", title: "服务", icon: "wrench.fill", route: "/my-needs?type=repair", description: "维修与服务履约", enabled: true, group: "business" }),
  make({ id: "works", title: "作品", icon: "doc.text.fill", route: "/creator?view=works", description: "已发布作品管理", enabled: true, group: "creator" }),
  make({ id: "drafts", title: "草稿", icon: "folder.fill", route: "/creator?view=drafts", description: "草稿和未发布内容", enabled: true, group: "creator" }),
  make({ id: "comments", title: "评论管理", icon: "text.bubble.fill", route: "/creator?view=comments", description: "本人发表的内容评论", enabled: true, group: "creator" }),
  make({ id: "favorites", title: "收藏", icon: "heart.fill", route: "/creator?view=favorites", description: "收藏的可信内容", enabled: true, group: "creator" }),
  make({ id: "following", title: "关注", icon: "person.2.fill", route: "/creator?view=following", description: "我关注的创作者", enabled: true, group: "creator" }),
  make({ id: "followers", title: "粉丝", icon: "person.2.fill", route: "/creator?view=followers", description: "关注我的用户", enabled: true, group: "creator" }),
  make({ id: "analytics", title: "创作数据", icon: "chart.bar.fill", route: "/creator?view=analytics", description: "浏览、互动与业务点击", enabled: true, group: "creator" }),
  make({ id: "owned-products", title: "我的产品", icon: "cube.box.fill", route: "/products/mine", description: "已绑定的产品实物", enabled: true, group: "trust" }),
  make({ id: "trace", title: "产品追溯", icon: "magnifyingglass", route: "/products/passport", description: "产品身份与履历", enabled: true, group: "trust" }),
  make({ id: "credit", title: "信用记录", icon: "shield.fill", route: "/credits", description: "信用变化与明细", enabled: true, group: "trust" }),
  make({ id: "appeals", title: "评价与申诉", icon: "flag.fill", route: "/complaints", description: "评价、投诉与申诉", enabled: true, group: "trust" }),
  make({ id: "certification", title: "认证管理", icon: "checkmark.seal.fill", route: "/verifications", description: "身份与资质认证", enabled: true, group: "trust" }),
  make({ id: "addresses", title: "地址", icon: "mappin.circle.fill", route: "/addresses", description: "收货与服务地址", enabled: true, group: "settings" }),
  make({ id: "location", title: "位置与隐私", icon: "location.fill", route: "/location", description: "城市、定位和隐私", enabled: true, group: "settings" }),
  make({ id: "security", title: "账号安全", icon: "lock.fill", route: "/settings", description: "登录和账号安全", enabled: true, group: "settings" }),
  make({ id: "notifications", title: "通知设置", icon: "message.fill", route: "/settings", description: "消息与推送偏好", enabled: true, group: "settings" }),
  make({ id: "organizations", title: "组织管理", icon: "briefcase.fill", route: "/organizations", description: "组织与成员", enabled: true, group: "settings" }),
  make({ id: "help", title: "帮助反馈", icon: "questionmark.circle.fill", route: "/help", description: "帮助、反馈与支持", enabled: true, group: "settings" }),
];
