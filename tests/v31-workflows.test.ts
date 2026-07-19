import { describe, expect, it } from "vitest";
import { assertHighRiskConfirmation, assertPaymentAmount, assertPaymentConfirmable, assertProjectMember, assertRefundAmount, assertRefundApprovable } from "../server/domain/finance-policy";
import { IdempotencyRegistry } from "../server/domain/idempotency";
import { applyComplaintRefund, freezeForComplaint } from "../server/domain/complaint-policy";
import { assertApprovedForBusiness } from "../server/domain/verification-policy";
import { hasPermission } from "../server/auth/permissions";
import { buildAuditValues } from "../server/services/audit-service";

describe("V3.1 资金、认证、投诉与权限状态机", () => {
  it("1. 同一支付单重复确认只发生一次状态变更", () => {
    expect(assertPaymentConfirmable("created")).toBe("confirm");
    expect(assertPaymentConfirmable("success")).toBe("already_success");
  });

  it("2. 同一个幂等键不会创建两笔支付", () => {
    const registry = new IdempotencyRegistry<{ id: number }>();
    expect(registry.run("pay-key", () => ({ id: 1 }))).toEqual({ value: { id: 1 }, created: true });
    expect(registry.run("pay-key", () => ({ id: 2 }))).toEqual({ value: { id: 1 }, created: false });
  });

  it("3. 支付金额与订单金额不一致时拒绝", () => {
    expect(() => assertPaymentAmount("100.00", "99.99")).toThrow("支付金额与订单金额不一致");
  });

  it("4. 同一退款不能重复批准", () => {
    expect(() => assertRefundApprovable("approved")).toThrow("不能重复");
  });

  it("5. 退款金额不能超过可退款金额", () => {
    expect(() => assertRefundAmount("80.01", "100.00", "20.00")).toThrow("退款金额不能超过可退款金额");
  });

  it("6. 同一里程碑不能重复创建结算", () => {
    const registry = new IdempotencyRegistry<number>();
    expect(registry.run("milestone:7:settlement", () => 101).created).toBe(true);
    expect(registry.run("milestone:7:settlement", () => 102)).toEqual({ value: 101, created: false });
  });

  it("7. 投诉建立后结算和托管均被冻结", () => {
    expect(freezeForComplaint()).toEqual({ escrowStatus: "frozen", settlementStatus: "frozen" });
  });

  it("8. 投诉裁定全额退款后托管和订单状态一致", () => {
    expect(applyComplaintRefund({ total: "100.00", refunded: "20.00", refund: "80.00" })).toEqual({
      refundedAmount: "100.00", escrowStatus: "refunded", orderStatus: "refunded",
    });
  });

  it("9. 未认证工程师不能提交正式报价", () => {
    expect(() => assertApprovedForBusiness("submitted", "engineer_quote")).toThrow("工程师不能提交");
  });

  it("10. 未认证商家不能提交回收报价", () => {
    expect(() => assertApprovedForBusiness("revoked", "merchant_recycling_quote")).toThrow("商家不能提交");
  });

  it("11. 无权限管理员不能审核退款", () => {
    expect(hasPermission("customer_service", "finance.refund.review")).toBe(false);
    expect(hasPermission("finance_operator", "finance.refund.review")).toBe(true);
  });

  it("12. 高风险管理员操作要求二次确认并生成脱敏审计记录", () => {
    expect(() => assertHighRiskConfirmation("wrong", "refund:1")).toThrow("二次确认");
    assertHighRiskConfirmation("CONFIRM:refund:1", "refund:1");
    const entry = buildAuditValues({
      actorId: 9, actorRole: "finance_operator", action: "refund.approve", resourceType: "refund", resourceId: 1,
      riskLevel: "high", detail: { token: "secret-token", reason: "复核通过" },
    });
    expect(entry.riskLevel).toBe("high");
    expect(entry.detail).toEqual({ token: "[REDACTED]", reason: "复核通过" });
  });

  it("13. 非项目成员不能访问项目资金数据", () => {
    expect(() => assertProjectMember(1, 2, 3)).toThrow("非项目成员");
    expect(() => assertProjectMember(1, 2, 2)).not.toThrow();
  });
});
