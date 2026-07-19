import { assertMoneyEqual, assertMoneyNotGreater, assertPositiveMoney, subtractMoney } from "./money";

export type PaymentState = "created" | "pending" | "success" | "failed" | "closed" | "refunding" | "partially_refunded" | "refunded";
export type RefundState = "draft" | "submitted" | "under_review" | "approved" | "processing" | "success" | "rejected" | "cancelled" | "failed";

export function assertPaymentAmount(orderAmount: string | number, paymentAmount: string | number) {
  assertPositiveMoney(paymentAmount, "支付金额必须大于 0");
  assertMoneyEqual(orderAmount, paymentAmount, "支付金额与订单金额不一致");
}

export function assertPaymentConfirmable(status: PaymentState) {
  if (status === "success") return "already_success" as const;
  if (!(["created", "pending", "failed"] as PaymentState[]).includes(status)) throw new Error("当前支付单状态不能确认");
  return "confirm" as const;
}

export function assertRefundApprovable(status: RefundState) {
  if (!(["submitted", "under_review"] as RefundState[]).includes(status)) throw new Error("该退款不能重复或越权批准");
}

export function refundableAmount(paymentAmount: string | number, alreadyRefunded: string | number) {
  return subtractMoney(paymentAmount, alreadyRefunded);
}

export function assertRefundAmount(amount: string | number, paymentAmount: string | number, alreadyRefunded: string | number) {
  assertPositiveMoney(amount, "退款金额必须大于 0");
  assertMoneyNotGreater(amount, refundableAmount(paymentAmount, alreadyRefunded), "退款金额不能超过可退款金额");
}

export function assertProjectMember(ownerId: number, engineerId: number, userId: number) {
  if (ownerId !== userId && engineerId !== userId) throw new Error("非项目成员不能访问项目资金数据");
}

export function assertHighRiskConfirmation(actual: string, expectedResource: string) {
  if (actual !== `CONFIRM:${expectedResource}`) throw new Error("高风险操作二次确认无效");
}
