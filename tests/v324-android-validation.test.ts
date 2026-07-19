import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { USER_DISCOVER_TABS } from "../lib/discover-tabs";

describe("V3.2.4 Android 发现页", () => {
  it("为普通用户提供回收分类并映射公开询价 Procedure", () => {
    expect(USER_DISCOVER_TABS).toContainEqual({
      key: "recycling",
      label: "回收",
      procedure: "recycling.openRequests",
    });
    expect(new Set(USER_DISCOVER_TABS.map((tab) => tab.key)).size).toBe(USER_DISCOVER_TABS.length);
  });
});

describe("V3.2.4 Android 置换选择", () => {
  it("让候选物品卡片直接执行选择，不嵌套详情导航点击区", () => {
    const source = readFileSync(resolve(process.cwd(), "app/swaps/create.tsx"), "utf8");

    expect(source).toContain('<ListingCard listing={item} onPress={() => setSelectedId(item.id)} />');
    expect(source).not.toContain('<Pressable onPress={() => setSelectedId(item.id)}>');
  });
});

describe("V3.2.4 Android 聊天键盘", () => {
  it("在 Android 上缩短聊天区域，避免输入栏被软键盘覆盖", () => {
    const source = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");

    expect(source).toContain('behavior={Platform.OS === "ios" ? "padding" : "height"}');
    expect(source).toContain('keyboardVerticalOffset={Platform.OS === "android" ? 96 : 0}');
    expect(source).not.toContain('behavior={Platform.OS === "ios" ? "padding" : undefined}');
  });
});

describe("V3.2.4 认证申请状态", () => {
  it("申请成功页与后端人工审核状态保持一致", () => {
    const engineer = readFileSync(resolve(process.cwd(), "app/engineer-apply.tsx"), "utf8");
    const merchant = readFileSync(resolve(process.cwd(), "app/merchant-apply.tsx"), "utf8");

    expect(engineer).toContain("认证申请已提交");
    expect(merchant).toContain("商家入驻申请已提交");
    expect(`${engineer}\n${merchant}`).not.toContain("自动通过");
  });
});

describe("V3.2.4 信用中心错误恢复", () => {
  it("请求失败时显示可重试错误态，而不是空数据", () => {
    const source = readFileSync(resolve(process.cwd(), "app/credits.tsx"), "utf8");

    expect(source).toContain("if (data.isError)");
    expect(source).toContain('title="信用数据加载失败"');
    expect(source).toContain("onRetry={() => void data.refetch()}");
    expect(source.indexOf("if (data.isError)")).toBeLessThan(source.indexOf("if (!data.data)"));
  });
});

describe("V3.2.4 平台运行审计权限错误", () => {
  it("查询被拒绝时显示明确错误，而不是把缺失数据当作空列表", () => {
    const source = readFileSync(resolve(process.cwd(), "app/admin/platform-operations.tsx"), "utf8");

    expect(source).toContain("if (files.isError || failures.isError)");
    expect(source).toContain('error?.data?.code === "FORBIDDEN"');
    expect(source).toContain('title={accessDenied ? "无权访问" : "平台运行数据加载失败"}');
    expect(source).toContain("void files.refetch()");
    expect(source).toContain("void failures.refetch()");
    expect(source.indexOf("if (files.isError || failures.isError)")).toBeLessThan(
      source.indexOf("(files.data ?? []).map"),
    );
  });
});
