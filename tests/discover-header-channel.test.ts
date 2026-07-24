import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DISCOVER_CHANNELS } from "../shared/navigation/appNavigation";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("发现页头部与频道栏", () => {
  it("头部包含城市、搜索和相机入口", () => {
    const header = source("components/discover/discover-header.tsx");
    expect(header).toContain("当前城市");
    expect(header).toContain("搜索内容、商品、服务或问 AI");
    expect(header).toContain('name="camera.fill"');
    expect(header).toContain('onPressCity');
    expect(header).toContain('onPressSearch');
    expect(header).toContain('onPressCamera');
  });

  it("城市入口进入位置页，搜索和相机使用稳定路由", () => {
    const screen = source("app/(tabs)/discover.tsx");
    expect(screen).toContain('onPressCity={() => router.push("/location" as never)}');
    expect(screen).toContain('onPressSearch={() => router.push("/search" as never)}');
    expect(screen).toContain('onScanPassport={() => router.push("/products/passport" as never)}');
    expect(screen).toContain('onShootAndPublish={() => router.push("/(tabs)/publish" as never)}');
  });

  it("频道数量和顺序固定为十个", () => {
    expect(DISCOVER_CHANNELS).toHaveLength(10);
    expect(DISCOVER_CHANNELS.map((item) => item.title)).toEqual([
      "推荐",
      "关注",
      "附近",
      "需求",
      "创意",
      "筹措",
      "商品",
      "服务",
      "经验",
      "视频",
    ]);
  });

  it("频道栏使用固定高度且频道项不允许 flex: 1 或 height: 100%", () => {
    const channelBar = source("components/discover/discover-channel-bar.tsx");
    expect(channelBar).toContain("height: 44");
    expect(channelBar).toContain("minHeight: 44");
    expect(channelBar).toContain("maxHeight: 44");
    expect(channelBar).not.toContain("flex: 1");
    expect(channelBar).not.toContain('height: "100%"');
  });

  it("关注加载态不会把频道栏拉伸，并保持状态区隔离", () => {
    const screen = source("app/(tabs)/discover.tsx");
    expect(screen).toContain("<DiscoverHeader");
    expect(screen).toContain("<DiscoverChannelBar");
    expect(screen).toContain('<View className="flex-1">');
    expect(screen).toContain("{contentState}");
    expect(screen).toContain('channel === "following" && !isAuthenticated');
    expect(screen).toContain('<DiscoverStateView state="loading"');
  });

  it("未登录关注显示登录引导，附近未选城市显示位置引导", () => {
    const screen = source("app/(tabs)/discover.tsx");
    expect(screen).toContain("登录后查看关注内容");
    expect(screen).toContain("先选择城市，再查看附近内容");
    expect(screen).toContain('actionTitle="登录"');
    expect(screen).toContain('actionTitle="选择位置"');
  });

  it("相机菜单包含三个动作，Android 返回键优先关闭菜单", () => {
    const cameraMenu = source("components/discover/discover-camera-menu.tsx");
    expect(cameraMenu).toContain("拍照搜索");
    expect(cameraMenu).toContain("扫描产品护照");
    expect(cameraMenu).toContain("拍摄并发布");
    expect(cameraMenu).toContain("onRequestClose={onClose}");
  });

  it("发现页不会直接向用户展示原始接口错误消息", () => {
    const screen = source("app/(tabs)/discover.tsx");
    expect(screen).not.toContain("hint={content.error.message}");
    expect(screen).toContain("discoverErrorMessage(content.error)");
  });
});
