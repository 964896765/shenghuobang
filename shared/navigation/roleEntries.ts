import type { AppEntry } from "./appNavigation";

const IDENTITY_ROLE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  repair_provider: ["service_provider", "engineer"],
  service_provider: ["engineer"],
  enterprise_representative: ["enterprise", "merchant"],
  nonprofit_representative: ["nonprofit"],
  designer: ["engineer"],
  manufacturer: ["merchant"],
  supplier: ["merchant"],
  recycler: ["merchant"],
};

export function roleCodesForIdentityType(typeCode: string): readonly string[] {
  return [typeCode, ...(IDENTITY_ROLE_ALIASES[typeCode] ?? [])];
}

export function appRoleForIdentityType(typeCode: string): "user" | "engineer" | "merchant" {
  const codes = roleCodesForIdentityType(typeCode);
  if (codes.includes("engineer")) return "engineer";
  if (codes.includes("merchant")) return "merchant";
  return "user";
}

export const ROLE_ENTRIES: readonly AppEntry[] = [
  { id: "personal", title: "个人工作台", icon: "person.fill", route: "/workspaces", description: "个人业务与可信资产", supportedRoles: ["user", "engineer", "merchant"], requiredCapabilities: [], locationAware: false, enabled: true, requiresAuth: true },
  { id: "enterprise", title: "企业工作台", icon: "briefcase.fill", route: "/workspaces", description: "企业组织、产品与协作", supportedRoles: ["merchant", "enterprise"], requiredCapabilities: ["workspace.enterprise"], locationAware: false, enabled: true, requiresAuth: true },
  { id: "provider", title: "服务商工作台", icon: "wrench.fill", route: "/workspaces", description: "服务供给与履约", supportedRoles: ["engineer", "merchant", "service_provider"], requiredCapabilities: ["workspace.service"], locationAware: true, enabled: true, requiresAuth: true },
  { id: "nonprofit", title: "公益组织工作台", icon: "gift.fill", route: "/workspaces", description: "公益项目与捐赠协作", supportedRoles: ["nonprofit"], requiredCapabilities: ["workspace.nonprofit"], locationAware: true, enabled: true, requiresAuth: true },
  { id: "designer", title: "设计师/工程师工作台", icon: "hammer.fill", route: "/workspaces", description: "方案、报价与项目协作", supportedRoles: ["engineer"], requiredCapabilities: ["workspace.engineer"], locationAware: true, enabled: true, requiresAuth: true },
  { id: "producer", title: "生产商/供应商工作台", icon: "storefront.fill", route: "/workspaces", description: "生产、供给与追溯", supportedRoles: ["merchant", "manufacturer", "supplier"], requiredCapabilities: ["workspace.supply"], locationAware: false, enabled: true, requiresAuth: true },
  { id: "recycler", title: "回收商工作台", icon: "arrow.3.trianglepath", route: "/workspaces", description: "回收受理与流转", supportedRoles: ["recycler", "merchant"], requiredCapabilities: ["workspace.recycling"], locationAware: true, enabled: true, requiresAuth: true },
];
