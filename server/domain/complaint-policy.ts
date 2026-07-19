import { addMoney, moneyToCents } from "./money";

export function freezeForComplaint() {
  return { escrowStatus: "frozen" as const, settlementStatus: "frozen" as const };
}

export function applyComplaintRefund(input: { total: string; refunded: string; refund: string }) {
  const refundedAmount = addMoney(input.refunded, input.refund);
  if (moneyToCents(refundedAmount) > moneyToCents(input.total)) throw new Error("裁定退款金额超过可退款金额");
  const full = moneyToCents(refundedAmount) === moneyToCents(input.total);
  return {
    refundedAmount,
    escrowStatus: full ? "refunded" as const : "partially_refunded" as const,
    orderStatus: full ? "refunded" as const : "refunding" as const,
  };
}
