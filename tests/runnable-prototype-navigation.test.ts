import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { USER_DISCOVER_TABS } from "../lib/discover-tabs";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("可运行雏形 M1 固定导航", () => {
  it("保持首页、发现、发布、消息、我的五个固定 Tab", () => {
    const layout = source("app/(tabs)/_layout.tsx");

    for (const title of ["首页", "发现", "发布", "消息", "我的"]) {
      expect(layout).toContain(`title: "${title}"`);
    }
    expect(layout).not.toContain("homeTitle");
    expect(layout).not.toContain("discoverTitle");
  });

  it("只在首页提供全局位置维护入口，其他发现页复用位置偏好", () => {
    const home = source("app/(tabs)/index.tsx");
    const discover = source("app/(tabs)/discover.tsx");
    const search = source("app/search.tsx");
    const engineers = source("app/engineers/index.tsx");

    expect(home).toContain("<ForegroundLocationCard");
    expect(home).toContain("trpc.home.feed.useQuery(location.queryInput)");
    for (const page of [discover, search, engineers]) {
      expect(page).not.toContain("<ForegroundLocationCard");
      expect(page).toContain("useForegroundLocation()");
      expect(page).toContain("location.queryInput");
    }
  });
});

describe("可运行雏形 M1 生命周期入口", () => {
  it("把真实创意列表纳入发现主分类，而不是保留旁路横幅", () => {
    const discover = source("app/(tabs)/discover.tsx");

    expect(USER_DISCOVER_TABS).toContainEqual({
      key: "ideas",
      label: "创意",
      procedure: "ideas.listPublic",
    });
    expect(discover).toContain("trpc.ideas.listPublic.useQuery");
    expect(discover).toContain("<IdeaCard idea={item} />");
    expect(discover).not.toContain("创意协作");
  });

  it("公共发布入口只指向已有真实表单", () => {
    const publish = source("app/(tabs)/publish.tsx");

    for (const route of ["/ideas/edit", "/needs/create?type=life", "/needs/create?type=product", "/needs/create?type=engineering", "/listings/create", "/recycling/create", "/listings/create?mode=giveaway"]) {
      expect(publish).toContain(`route: "${route}"`);
    }
    expect(publish).toContain("需求与创意");
    expect(publish).toContain("物品与循环");
  });

  it("我的页按生命周期和治理入口分组", () => {
    const profile = source("app/(tabs)/profile.tsx");

    expect(profile).toContain("创意与项目");
    expect(profile).toContain("物品、交易与循环");
    expect(profile).toContain("身份、信用与支持");
  });
});
