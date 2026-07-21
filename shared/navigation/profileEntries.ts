import { ALL_NAVIGATION_ROLES, type AppEntry } from "./appNavigation";

const make = (value: Omit<AppEntry, "supportedRoles" | "requiredCapabilities" | "locationAware">): AppEntry => ({
  ...value, supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: false, requiresAuth: true,
});

export const PROFILE_ENTRIES: readonly AppEntry[] = [
  make({ id: "orders", title: "订单", icon: "creditcard.fill", route: "/orders", description: "购买与服务订单", enabled: true, group: "business" }),
  make({ id: "needs", title: "需求", icon: "list.bullet.rectangle.fill", route: "/my-needs", description: "我发布的需求", enabled: true, group: "business" }),
  make({ id: "ideas", title: "创意", icon: "lightbulb.fill", route: "/ideas/mine", description: "我发起和参与的创意", enabled: true, group: "business" }),
  make({ id: "funding", title: "筹措", icon: "banknote.fill", route: "/funding/mine", description: "我发起和支持的筹措", enabled: true, group: "business" }),
  make({ id: "products", title: "产品", icon: "cube.box.fill", route: "/products/mine", description: "我的产品模型与实物", enabled: true, group: "business" }),
  make({ id: "services", title: "服务", icon: "wrench.fill", route: "/coming-soon?feature=我的服务", description: "服务发布与履约", enabled: false, group: "business" }),
  ...[
    ["works", "作品", "doc.text.fill", "作品管理"], ["drafts", "草稿", "folder.fill", "草稿箱"],
    ["comments", "评论管理", "text.bubble.fill", "评论与回复"], ["favorites", "收藏", "heart.fill", "收藏内容"],
    ["following", "关注", "person.2.fill", "我的关注"], ["followers", "粉丝", "person.2.fill", "我的粉丝"],
    ["analytics", "创作数据", "chart.bar.fill", "内容数据"],
  ].map(([id, title, icon, description]) => make({ id, title, icon: icon as AppEntry["icon"], route: `/coming-soon?feature=${title}`, description, enabled: false, group: "creator" })),
  make({ id: "owned-products", title: "我的产品", icon: "cube.box.fill", route: "/products/mine", description: "已绑定的产品实物", enabled: true, group: "trust" }),
  make({ id: "trace", title: "产品追溯", icon: "magnifyingglass", route: "/products/passport", description: "产品身份与履历", enabled: true, group: "trust" }),
  make({ id: "credit", title: "信用记录", icon: "shield.fill", route: "/credits", description: "信用变化与明细", enabled: true, group: "trust" }),
  make({ id: "appeals", title: "评价与申诉", icon: "flag.fill", route: "/complaints", description: "评价、投诉与申诉", enabled: true, group: "trust" }),
  make({ id: "certification", title: "认证管理", icon: "checkmark.seal.fill", route: "/verifications", description: "身份与资质认证", enabled: true, group: "trust" }),
  make({ id: "addresses", title: "地址", icon: "mappin.circle.fill", route: "/coming-soon?feature=地址管理", description: "收货与服务地址", enabled: false, group: "settings" }),
  make({ id: "location", title: "位置与隐私", icon: "location.fill", route: "/location", description: "城市、定位和隐私", enabled: true, group: "settings" }),
  make({ id: "security", title: "账号安全", icon: "lock.fill", route: "/settings", description: "登录和账号安全", enabled: true, group: "settings" }),
  make({ id: "notifications", title: "通知设置", icon: "message.fill", route: "/settings", description: "消息与推送偏好", enabled: true, group: "settings" }),
  make({ id: "organizations", title: "组织管理", icon: "briefcase.fill", route: "/organizations", description: "组织与成员", enabled: true, group: "settings" }),
  make({ id: "help", title: "帮助反馈", icon: "questionmark.circle.fill", route: "/help", description: "帮助、反馈与支持", enabled: true, group: "settings" }),
];
