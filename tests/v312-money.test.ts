import { describe, expect, it } from "vitest";
import { assertPaymentAmount, assertRefundAmount } from "../server/domain/finance-policy";
import { assertPositiveMoney } from "../server/domain/money";

describe("V3.1.2 正金额规则", () => {
  it("拒绝 0 元支付", () => {
    expect(() => assertPaymentAmount(0, 0)).toThrow("支付金额必须大于 0");
  });

  it("拒绝负数支付", () => {
    expect(() => assertPaymentAmount(-1, -1)).toThrow();
  });

  it("拒绝 0 元退款", () => {
    expect(() => assertRefundAmount(0, 100, 0)).toThrow("退款金额必须大于 0");
  });

  it("拒绝负数退款", () => {
    expect(() => assertRefundAmount(-1, 100, 0)).toThrow();
  });

  it("拒绝 0 元托管释放", () => {
    expect(() => assertPositiveMoney(0, "托管释放金额必须大于 0")).toThrow("托管释放金额必须大于 0");
  });

  it("拒绝负数托管释放", () => {
    expect(() => assertPositiveMoney(-1, "托管释放金额必须大于 0")).toThrow();
  });
});
