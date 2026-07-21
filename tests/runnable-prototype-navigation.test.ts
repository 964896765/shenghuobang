import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { APP_TABS, DISCOVER_CHANNELS } from "../shared/navigation/appNavigation";
import { PROFILE_ENTRIES } from "../shared/navigation/profileEntries";
import { PUBLISH_ENTRIES } from "../shared/navigation/publishEntries";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("可运行雏形统一导航", () => {
  it("保持首页、发现、发布、消息、我的五个固定 Tab", () => {
    expect(APP_TABS.map((item) => item.title)).toEqual(["首页", "发现", "发布", "消息", "我的"]);
    const layout = source("app/(tabs)/_layout.tsx");
    expect(layout).toContain("APP_TABS.map");
    expect(layout).not.toContain("homeTitle");
    expect(layout).not.toContain("discoverTitle");
  });

  it("全局位置只有一个 Provider，首页显示唯一维护入口", () => {
    const root = source("app/_layout.tsx");
    const home = source("app/(tabs)/index.tsx");
    const discover = source("app/(tabs)/discover.tsx");
    const search = source("app/search.tsx");
    const engineers = source("app/engineers/index.tsx");
    expect(root).toContain("<GlobalLocationProvider>");
    expect(home).toContain("<GlobalHeader />");
    expect(home).toContain("trpc.home.feed.useQuery(location.queryInput)");
    for (const page of [discover, search, engineers]) {
      expect(page).not.toContain("<LocationEntry");
      expect(page).toContain("useGlobalLocation()");
      expect(page).toContain("location.queryInput");
    }
  });
});

describe("可运行雏形统一入口", () => {
  it("创意进入固定发现频道并复用真实卡片", () => {
    const discover = source("app/(tabs)/discover.tsx");
    expect(DISCOVER_CHANNELS).toContainEqual({ id: "ideas", title: "创意" });
    expect(discover).toContain("trpc.ideas.listPublic.useQuery");
    expect(discover).toContain("<IdeaCard idea={item} />");
  });

  it("业务发布入口指向已有真实表单，未完成内容统一关闭", () => {
    expect(PUBLISH_ENTRIES.filter((entry) => entry.group === "business" && entry.enabled)).toHaveLength(7);
    expect(PUBLISH_ENTRIES.filter((entry) => entry.group === "content").every((entry) => !entry.enabled)).toBe(true);
    expect(PUBLISH_ENTRIES.find((entry) => entry.id === "idea")?.route).toBe("/ideas/edit");
    expect(PUBLISH_ENTRIES.find((entry) => entry.id === "funding-progress")?.route).toContain("/coming-soon");
  });

  it("我的页由业务、创作者、可信资产和设置四组统一生成", () => {
    expect(new Set(PROFILE_ENTRIES.map((entry) => entry.group))).toEqual(new Set(["business", "creator", "trust", "settings"]));
    const profile = source("app/(tabs)/profile.tsx");
    expect(profile).toContain("PROFILE_ENTRIES.filter");
    expect(profile).toContain("ROLE_ENTRIES.filter");
  });
});
