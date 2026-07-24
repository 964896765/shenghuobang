import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDeviceLocationUpdatePayload,
  buildManualLocationUpdatePayload,
  approximateDistance,
  distanceKm,
  formatLocationPreferenceError,
  isLocationOwnerActive,
  locationOwnerKey,
  nearbyRank,
  normalizeViewerLocation,
  resolveForegroundPermission,
  resolveStoredLocationName,
  roundForStorage,
  scopedLocationValue,
  stableNearbySort,
} from "../shared/location";

describe("V3.2.4-R2 前台位置权限状态", () => {
  it("区分首次、允许、拒绝、永久拒绝和系统定位关闭", () => {
    expect(resolveForegroundPermission({ status: "undetermined", canAskAgain: true, servicesEnabled: true })).toBe("not_asked");
    expect(resolveForegroundPermission({ status: "granted", canAskAgain: true, servicesEnabled: true })).toBe("granted");
    expect(resolveForegroundPermission({ status: "granted", canAskAgain: true, servicesEnabled: false })).toBe("services_disabled");
    expect(resolveForegroundPermission({ status: "denied", canAskAgain: true, servicesEnabled: true })).toBe("denied");
    expect(resolveForegroundPermission({ status: "denied", canAskAgain: false, servicesEnabled: true })).toBe("permanently_denied");
  });

  it("只在用户确认后请求权限，并支持超时、重试和前后台刷新", () => {
    const hook = readFileSync(resolve(process.cwd(), "hooks/use-foreground-location.ts"), "utf8");
    const card = readFileSync(resolve(process.cwd(), "components/foreground-location-card.tsx"), "utf8");
    expect(card).toContain("生活帮仅在你主动使用附近功能时获取一次位置");
    expect(card).toContain("onPress: () => void location.request()");
    expect(hook).toContain("LOCATION_TIMEOUT_MS");
    expect(hook).toContain('current === SERVICES_DISABLED_MESSAGE ? undefined : current');
    expect(hook).toContain('setCoordinates(undefined)');
    expect(hook).toContain('AppState.addEventListener("change"');
    expect(hook).toContain("openSettings");
  });

  it("支持手动地区，退出账号清理位置缓存", () => {
    const hook = readFileSync(resolve(process.cwd(), "hooks/use-foreground-location.ts"), "utf8");
    const card = readFileSync(resolve(process.cwd(), "components/foreground-location-card.tsx"), "utf8");
    const api = readFileSync(resolve(process.cwd(), "lib/_core/api.ts"), "utf8");
    expect(hook).toContain('current === "idle" ? "manual" : current');
    expect(hook).toContain('setLocationState("manual")');
    expect(card).toContain("if (location.region) setManualRegion(location.region)");
    expect(api).toContain("clearLocationCaches()");
  });

  it("手动城市保存失败时不应先把未落库城市写入当前状态", () => {
    const hook = readFileSync(resolve(process.cwd(), "hooks/use-foreground-location.ts"), "utf8");
    expect(hook.indexOf("await updatePreference.mutateAsync(payload);")).toBeLessThan(hook.indexOf("setRegion(payload.cityName);"));
  });

  it("手动城市只提交 cityName，缺少 regionName 也能形成有效 payload", () => {
    expect(buildManualLocationUpdatePayload(" 杭州 ")).toEqual({
      source: "manual",
      cityName: "杭州",
    });
  });

  it("设备逆地理编码优先拆出 cityName 和 regionName，并使用更细的展示地区", () => {
    expect(buildDeviceLocationUpdatePayload(
      { latitude: 30.2741, longitude: 120.1551 },
      { region: "浙江省", city: "杭州市", district: "西湖区" },
    )).toEqual({
      source: "device",
      latitude: 30.2741,
      longitude: 120.1551,
      cityName: "杭州市",
      regionName: "西湖区",
      displayName: "西湖区",
    });
  });

  it("用户可见错误不暴露原始 Zod JSON", () => {
    const message = formatLocationPreferenceError(new Error('[{"origin":"string","code":"too_small","minimum":2,"path":["regionName"],"message":"Too small: expected string to have >=2 characters"}]'));
    expect(message).toBe("城市信息不完整，请重新定位或选择城市。");
    expect(message).not.toContain("too_small");
    expect(message).not.toContain("regionName");
  });
});

describe("V3.2.4-R2 位置隐私和排序", () => {
  it("按账号隔离内存位置状态并拒绝旧异步结果", () => {
    expect(locationOwnerKey()).toBe("guest");
    expect(locationOwnerKey(42)).toBe("user:42");
    expect(isLocationOwnerActive("user:42", "user:42")).toBe(true);
    expect(isLocationOwnerActive("user:42", "user:43")).toBe(false);
    expect(scopedLocationValue("user:42", "user:43", { region: "旧账号地区" })).toBeUndefined();
  });

  it("服务端存储前降为约 1 公里精度", () => {
    expect(roundForStorage(39.987654)).toBe(39.99);
    expect(roundForStorage(116.321987)).toBe(116.32);
  });

  it("拒绝无效或不完整坐标并保留手动地区", () => {
    expect(normalizeViewerLocation({ latitude: 100, longitude: 20, region: "北京" })).toEqual({ region: "北京" });
    expect(normalizeViewerLocation({ latitude: 39.9, region: "北京" })).toEqual({ region: "北京" });
  });

  it("优先展示 regionName，其次回退 cityName", () => {
    expect(resolveStoredLocationName({ regionName: "西湖区", cityName: "杭州市" })).toBe("西湖区");
    expect(resolveStoredLocationName({ cityName: "杭州" })).toBe("杭州");
  });

  it("距离只输出近似整数公里", () => {
    const distance = distanceKm(
      { latitude: 39.9, longitude: 116.4 },
      { latitude: 39.91, longitude: 116.41 },
    );
    const result = approximateDistance(distance);
    expect(result?.distanceKm).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result?.distanceKm)).toBe(true);
  });

  it("无坐标时按地区匹配，无位置时稳定回退原排序", () => {
    expect(nearbyRank({ region: "海淀区" }, undefined, "北京市海淀区").distanceLabel).toBe("同地区");
    const sorted = stableNearbySort([
      { id: "old-a", rank: Number.POSITIVE_INFINITY, index: 0 },
      { id: "old-b", rank: Number.POSITIVE_INFINITY, index: 1 },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["old-a", "old-b"]);
  });

  it("有坐标的距离结果优先于只有同地区标签的旧数据", () => {
    const viewer = { latitude: 39.9, longitude: 116.4, region: "海淀区" };
    const known = nearbyRank(viewer, { latitude: 39.91, longitude: 116.41, region: "海淀区" });
    const legacy = nearbyRank(viewer, undefined, "北京市海淀区");
    expect(known.rank).toBeLessThan(legacy.rank);
    expect(legacy.rank).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it("公开路由只添加 distanceKm/distanceLabel，不返回坐标字段", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(source).toContain("distanceKm, distanceLabel");
    expect(source).not.toContain("approximateLatitude: location.approximateLatitude");
    expect(source).not.toContain("approximateLongitude: location.approximateLongitude");
  });
});
