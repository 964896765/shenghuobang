import { describe, expect, it } from "vitest";

import { validateListingImage } from "../lib/listing-image-policy";
import { listingFormPayload, type ListingFormValues, validateListingForm } from "../lib/listing-form";
import { dedupeMessages, dedupeNotifications } from "../lib/message-display";
import { notificationRoute } from "../lib/notification-navigation";

const validForm: ListingFormValues = {
  title: "九成新台灯",
  category: "家居",
  brand: "",
  conditionLevel: "九成新",
  functionStatus: "功能正常",
  description: "正常使用，灯泡和电源线齐全",
  cityName: "北京市朝阳区",
  modes: ["fixed_price"],
  primaryMode: "fixed_price",
  price: "80",
  minAcceptPrice: "",
  swapIntent: "",
  giveawayRule: "apply",
};

describe("V3.2.2 物品发布表单", () => {
  it("拒绝空标题、空描述和非正整数金额", () => {
    expect(validateListingForm({ ...validForm, title: " " })).toContain("物品名称");
    expect(validateListingForm({ ...validForm, description: " " })).toContain("物品状况");
    expect(validateListingForm({ ...validForm, price: "0" })).toContain("大于 0");
    expect(validateListingForm({ ...validForm, price: "1.5" })).toContain("整元");
  });

  it("置换方式必须填写交换意向", () => {
    expect(validateListingForm({ ...validForm, modes: ["swap"], primaryMode: "swap", price: "", swapIntent: "" })).toContain("希望交换");
  });

  it("提交时只生成当前整元金额模型允许的数字", () => {
    expect(listingFormPayload(validForm)).toMatchObject({ price: 80, minAcceptPrice: null, cityName: "北京市朝阳区" });
  });
});

describe("V3.2.2 图片选择", () => {
  it("接受常见安全图片并拒绝超限或错误 MIME", () => {
    expect(validateListingImage({ name: "item.jpg", mimeType: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateListingImage({ name: "item.svg", mimeType: "image/svg+xml", size: 1024 })).toContain("仅支持");
    expect(validateListingImage({ name: "huge.png", mimeType: "image/png", size: 9 * 1024 * 1024 })).toContain("8MB");
  });
});

describe("V3.2.2 消息与通知展示", () => {
  it("按服务端 id 和客户端幂等键隐藏重复消息", () => {
    const messages = dedupeMessages([
      { id: 1, clientMessageId: "client-1" },
      { id: 1, clientMessageId: "client-1" },
      { id: 2, clientMessageId: "client-1" },
      { id: 3, clientMessageId: "client-3" },
    ]);
    expect(messages.map((message) => message.id)).toEqual([1, 3]);
  });

  it("按业务去重键隐藏重复通知", () => {
    expect(dedupeNotifications([{ id: 1, dedupeKey: "swap:1" }, { id: 2, dedupeKey: "swap:1" }, { id: 3, dedupeKey: null }]).map((item) => item.id)).toEqual([1, 3]);
  });

  it("覆盖物品、置换、回收、会话和无目标通知跳转", () => {
    expect(notificationRoute("listing", 7)).toBe("/listings/7");
    expect(notificationRoute("swap", 8)).toBe("/swaps/8");
    expect(notificationRoute("recycling", 9)).toBe("/recycling/9");
    expect(notificationRoute("conversation", 10)).toBe("/chat/10");
    expect(notificationRoute("system", 11)).toBeNull();
  });
});
