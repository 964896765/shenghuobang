import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldBlockAndroidBack } from "../lib/mobile-navigation";
import { mediaPermissionGuidance } from "../lib/media-permissions";
import { resolveNotificationRoute } from "../lib/push/notification-routing";
import { ExpoPushProvider, isExpoPushToken } from "../server/notifications/expo-provider";
import { createPushProvider } from "../server/notifications/registry";

afterEach(() => vi.restoreAllMocks());

describe("V3.2.3 通知跳转", () => {
  it("统一解析站内与 Push 的业务资源", () => {
    expect(resolveNotificationRoute({ refType: "message", refId: "21" })).toBe("/chat/21");
    expect(resolveNotificationRoute({ type: "swap_status", swapId: 22 })).toBe("/swaps/22");
    expect(resolveNotificationRoute({ type: "recycling_quote", recyclingId: "23" })).toBe("/recycling/23");
    expect(resolveNotificationRoute({ type: "order_status", orderId: 24 })).toBe("/orders/24");
  });

  it("缺少参数或未知类型时不生成危险路由", () => {
    expect(resolveNotificationRoute({ type: "order_status" })).toBeNull();
    expect(resolveNotificationRoute({ type: "unknown", refId: 1 })).toBeNull();
    expect(resolveNotificationRoute({ refType: "listing", refId: "-1" })).toBeNull();
  });
});

describe("V3.2.3 权限与 Android 返回", () => {
  it("允许有限照片权限并为永久拒绝提供设置指引", () => {
    expect(mediaPermissionGuidance({ granted: false, canAskAgain: true, accessPrivileges: "limited" }).allowed).toBe(true);
    expect(mediaPermissionGuidance({ granted: false, canAskAgain: false, accessPrivileges: "none" })).toMatchObject({
      allowed: false,
      shouldOpenSettings: true,
    });
  });

  it("仅在有未保存内容且没有保存中时拦截返回", () => {
    expect(shouldBlockAndroidBack(true, false)).toBe(true);
    expect(shouldBlockAndroidBack(true, true)).toBe(false);
    expect(shouldBlockAndroidBack(false, false)).toBe(false);
  });
});

describe("V3.2.3 Expo Push Provider", () => {
  it("校验 Expo Push Token 并按环境选择 Provider", () => {
    expect(isExpoPushToken("ExpoPushToken[abc_123-XYZ]")).toBe(true);
    expect(isExpoPushToken("plain-device-token")).toBe(false);
    expect(createPushProvider("log").name).toBe("log");
    expect(createPushProvider("expo").name).toBe("expo");
    expect(() => createPushProvider("unknown")).toThrow("Unsupported PUSH_PROVIDER");
  });

  it("保存 Expo ticket id 且只发送必要业务 Data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { status: "ok", id: "ticket-1" } }), { status: 200 }));
    const provider = new ExpoPushProvider("", "https://push.example.test/send");
    await expect(provider.send({ token: "ExpoPushToken[abc_123]", title: "置换状态", data: { type: "swap", refId: "7", notificationId: "9" } }))
      .resolves.toEqual({ success: true, providerMessageId: "ticket-1" });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.data).toEqual({ type: "swap", refId: "7", notificationId: "9" });
    expect(JSON.stringify(request)).not.toMatch(/JWT|phone|Authorization/i);
  });

  it("无效 Token 在调用远端前返回 DeviceNotRegistered", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await new ExpoPushProvider().send({ token: "invalid", title: "测试" });
    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain("DeviceNotRegistered");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
