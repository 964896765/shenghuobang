import { describe, expect, it } from "vitest";

import { APP_TABS, DISCOVER_CHANNELS, MESSAGE_CHANNELS } from "../shared/navigation/appNavigation";
import { HOME_ENTRIES } from "../shared/navigation/homeEntries";
import { PROFILE_ENTRIES } from "../shared/navigation/profileEntries";
import { PUBLISH_ENTRIES } from "../shared/navigation/publishEntries";
import { appRoleForIdentityType, ROLE_ENTRIES, roleCodesForIdentityType } from "../shared/navigation/roleEntries";
import { resolveEntryAccess } from "../shared/navigation/routePermissions";

describe("统一 App 导航契约", () => {
  it("固定五个底部入口且顺序稳定", () => {
    expect(APP_TABS.map((item) => item.title)).toEqual(["首页", "发现", "发布", "消息", "我的"]);
  });

  it("固定首页八个核心入口", () => {
    expect(HOME_ENTRIES.map((item) => item.title)).toEqual([
      "需求", "创意", "新品筹措", "商城", "产品追溯", "维修", "捐赠", "回收",
    ]);
  });

  it("发布中心包含七个业务入口和九个内容入口", () => {
    expect(PUBLISH_ENTRIES.filter((item) => item.group === "business")).toHaveLength(7);
    expect(PUBLISH_ENTRIES.filter((item) => item.group === "content")).toHaveLength(9);
  });

  it("发现和消息频道保持唯一固定分类", () => {
    expect(DISCOVER_CHANNELS.map((item) => item.title)).toEqual(["推荐", "关注", "产品", "创意", "经验", "视频", "问答", "附近"]);
    expect(MESSAGE_CHANNELS.map((item) => item.title)).toEqual(["聊天", "业务", "互动", "系统"]);
  });

  it("入口都具备统一字段且我的页面包含四个分组", () => {
    for (const entry of [...HOME_ENTRIES, ...PUBLISH_ENTRIES, ...PROFILE_ENTRIES, ...ROLE_ENTRIES]) {
      expect(entry).toEqual(expect.objectContaining({
        id: expect.any(String), title: expect.any(String), icon: expect.any(String), route: expect.any(String),
        description: expect.any(String), supportedRoles: expect.any(Array), requiredCapabilities: expect.any(Array),
        locationAware: expect.any(Boolean), enabled: expect.any(Boolean),
      }));
    }
    expect(new Set(PROFILE_ENTRIES.map((item) => item.group))).toEqual(new Set(["business", "creator", "trust", "settings"]));
  });

  it("统一处理未登录、无权限和功能关闭", () => {
    const publicEntry = HOME_ENTRIES.find((item) => item.id === "needs")!;
    const disabledEntry = { ...HOME_ENTRIES.find((item) => item.id === "repair")!, enabled: false };
    const engineerEntry = ROLE_ENTRIES.find((item) => item.id === "designer")!;
    expect(resolveEntryAccess(publicEntry, { role: "user", isAuthenticated: false })).toBe("allowed");
    expect(resolveEntryAccess(disabledEntry, { role: "user", isAuthenticated: true })).toBe("feature_disabled");
    expect(resolveEntryAccess(engineerEntry, { role: "user", isAuthenticated: true })).toBe("permission_denied");
  });

  it("真正使用 capability 做入口裁剪", () => {
    const engineerEntry = ROLE_ENTRIES.find((item) => item.id === "designer")!;
    expect(resolveEntryAccess(engineerEntry, { role: "engineer", isAuthenticated: true, capabilities: [] })).toBe("permission_denied");
    expect(resolveEntryAccess(engineerEntry, { role: "engineer", isAuthenticated: true, capabilities: ["workspace.engineer"] })).toBe("allowed");
  });

  it("把服务端业务身份映射到统一客户端工作台上下文", () => {
    expect(appRoleForIdentityType("repair_provider")).toBe("engineer");
    expect(roleCodesForIdentityType("repair_provider")).toEqual(["repair_provider", "service_provider", "engineer"]);
    expect(appRoleForIdentityType("enterprise_representative")).toBe("merchant");
    expect(roleCodesForIdentityType("nonprofit_representative")).toContain("nonprofit");
  });
});
