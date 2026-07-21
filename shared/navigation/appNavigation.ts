export type NavigationRole =
  | "user"
  | "engineer"
  | "merchant"
  | "enterprise"
  | "service_provider"
  | "nonprofit"
  | "manufacturer"
  | "supplier"
  | "recycler";

export type NavigationIcon =
  | "house.fill"
  | "safari.fill"
  | "plus.circle.fill"
  | "message.fill"
  | "person.fill"
  | "briefcase.fill"
  | "list.bullet.rectangle.fill"
  | "folder.fill"
  | "storefront.fill"
  | "doc.text.fill"
  | "magnifyingglass"
  | "sparkles"
  | "wrench.fill"
  | "arrow.3.trianglepath"
  | "gift.fill"
  | "cube.box.fill"
  | "person.2.fill"
  | "mappin.circle.fill"
  | "star.fill"
  | "checkmark.seal.fill"
  | "creditcard.fill"
  | "shield.fill"
  | "lightbulb.fill"
  | "square.grid.2x2.fill"
  | "heart.fill"
  | "camera.fill"
  | "location.fill"
  | "gearshape.fill"
  | "questionmark.circle.fill"
  | "tag.fill"
  | "banknote.fill"
  | "hammer.fill"
  | "cart.fill"
  | "flag.fill"
  | "text.bubble.fill"
  | "chart.bar.fill"
  | "lock.fill";

export type AppEntry = {
  id: string;
  title: string;
  icon: NavigationIcon;
  route: string;
  description: string;
  supportedRoles: readonly NavigationRole[];
  requiredCapabilities: readonly string[];
  locationAware: boolean;
  enabled: boolean;
  requiresAuth?: boolean;
  group?: string;
};

export const ALL_NAVIGATION_ROLES: readonly NavigationRole[] = [
  "user", "engineer", "merchant", "enterprise", "service_provider", "nonprofit",
  "manufacturer", "supplier", "recycler",
];

export const APP_TABS = [
  { id: "home", name: "index", title: "首页", icon: "house.fill" },
  { id: "discover", name: "discover", title: "发现", icon: "safari.fill" },
  { id: "publish", name: "publish", title: "发布", icon: "plus.circle.fill" },
  { id: "messages", name: "messages", title: "消息", icon: "message.fill" },
  { id: "profile", name: "profile", title: "我的", icon: "person.fill" },
] as const;

export const DISCOVER_CHANNELS = [
  { id: "recommended", title: "推荐" },
  { id: "following", title: "关注" },
  { id: "products", title: "产品" },
  { id: "ideas", title: "创意" },
  { id: "experience", title: "经验" },
  { id: "videos", title: "视频" },
  { id: "questions", title: "问答" },
  { id: "nearby", title: "附近" },
] as const;

export const MESSAGE_CHANNELS = [
  { id: "chat", title: "聊天" },
  { id: "business", title: "业务" },
  { id: "interaction", title: "互动" },
  { id: "system", title: "系统" },
] as const;
