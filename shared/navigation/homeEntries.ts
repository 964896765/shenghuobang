import { ALL_NAVIGATION_ROLES, type AppEntry } from "./appNavigation";

export const HOME_ENTRIES: readonly AppEntry[] = [
  { id: "needs", title: "需求", icon: "list.bullet.rectangle.fill", route: "/my-needs", description: "发布与管理真实需求", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: true, enabled: true, requiresAuth: true },
  { id: "ideas", title: "创意", icon: "lightbulb.fill", route: "/ideas", description: "发现、共创与验证创意", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: false, enabled: true },
  { id: "funding", title: "新品筹措", icon: "banknote.fill", route: "/funding", description: "参与新品筹措与进展", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: false, enabled: true },
  { id: "mall", title: "商城", icon: "cart.fill", route: "/products", description: "可信产品与服务", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: true, enabled: true },
  { id: "trace", title: "产品追溯", icon: "cube.box.fill", route: "/products/passport", description: "查询产品身份与履历", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: false, enabled: true },
  { id: "repair", title: "维修", icon: "wrench.fill", route: "/coming-soon?feature=维修服务", description: "报修、诊断与服务匹配", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: true, enabled: false },
  { id: "donation", title: "捐赠", icon: "gift.fill", route: "/coming-soon?feature=捐赠专区", description: "物品捐赠与公益流转", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: true, enabled: false },
  { id: "recycling", title: "回收", icon: "arrow.3.trianglepath", route: "/recycling/create", description: "发布回收并跟踪处理", supportedRoles: ALL_NAVIGATION_ROLES, requiredCapabilities: [], locationAware: true, enabled: true, requiresAuth: true },
];
