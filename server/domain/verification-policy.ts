export function assertApprovedForBusiness(status: string | null | undefined, business: "engineer_quote" | "merchant_recycling_quote") {
  if (status === "approved") return;
  if (business === "engineer_quote") throw new Error("未认证或认证已失效的工程师不能提交正式收费报价");
  throw new Error("未认证或认证已失效的商家不能提交回收报价或承接订单");
}
