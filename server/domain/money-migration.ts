import { legacyYuanToCents, moneyToCents, signedMoneyToCents } from "./money";

export type MoneyStorageKind = "legacy_int_yuan" | "decimal_yuan";

export type MoneyFieldDefinition = {
  table: string;
  column: string;
  domain: string;
  storage: MoneyStorageKind;
  nullable: boolean;
  allowNegative?: boolean;
};

/**
 * V3.3.0 phase-1 inventory. Any schema money field added later must be registered here
 * before the migration plan can be considered complete.
 */
export const MONEY_FIELD_REGISTRY: readonly MoneyFieldDefinition[] = [
  { table: "engineer_profiles", column: "startingPrice", domain: "engineer", storage: "legacy_int_yuan", nullable: true },
  { table: "needs", column: "budgetMin", domain: "need", storage: "legacy_int_yuan", nullable: true },
  { table: "needs", column: "budgetMax", domain: "need", storage: "legacy_int_yuan", nullable: true },
  { table: "quotes", column: "totalPrice", domain: "project", storage: "legacy_int_yuan", nullable: false },
  { table: "quote_versions", column: "totalPrice", domain: "project", storage: "legacy_int_yuan", nullable: false },
  { table: "projects", column: "totalAmount", domain: "project", storage: "legacy_int_yuan", nullable: false },
  { table: "milestones", column: "amount", domain: "project", storage: "legacy_int_yuan", nullable: true },
  { table: "project_changes", column: "amountDelta", domain: "project", storage: "legacy_int_yuan", nullable: false, allowNegative: true },
  { table: "listings", column: "price", domain: "listing", storage: "legacy_int_yuan", nullable: true },
  { table: "listings", column: "minAcceptPrice", domain: "listing", storage: "legacy_int_yuan", nullable: true },
  { table: "offers", column: "amount", domain: "listing", storage: "legacy_int_yuan", nullable: false },
  { table: "recycling_requests", column: "expectedPrice", domain: "recycling", storage: "legacy_int_yuan", nullable: true },
  { table: "recycling_quotes", column: "amount", domain: "recycling", storage: "legacy_int_yuan", nullable: false },
  { table: "recycling_quotes", column: "adjustedAmount", domain: "recycling", storage: "legacy_int_yuan", nullable: true },
  { table: "orders", column: "amount", domain: "order", storage: "legacy_int_yuan", nullable: false },
  { table: "items", column: "purchasePrice", domain: "item", storage: "legacy_int_yuan", nullable: true },
  { table: "item_service_history", column: "amount", domain: "item", storage: "legacy_int_yuan", nullable: true },
  { table: "payments", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "payment_events", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: true },
  { table: "refunds", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "escrow_records", column: "totalAmount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "escrow_records", column: "fundedAmount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "escrow_records", column: "releasedAmount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "escrow_records", column: "refundedAmount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "settlements", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "settlement_items", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "escrow_releases", column: "amount", domain: "finance", storage: "decimal_yuan", nullable: false },
  { table: "complaint_decisions", column: "refundAmount", domain: "complaint", storage: "decimal_yuan", nullable: true },
  { table: "complaint_decisions", column: "releaseAmount", domain: "complaint", storage: "decimal_yuan", nullable: true },
  { table: "complaint_fund_actions", column: "amount", domain: "complaint", storage: "decimal_yuan", nullable: true },
] as const;

export function moneyFieldKey(field: Pick<MoneyFieldDefinition, "table" | "column">): string {
  return `${field.table}.${field.column}`;
}

export function sourceValueToCents(field: MoneyFieldDefinition, value: string | number): bigint {
  if (field.storage === "legacy_int_yuan") {
    const numberValue = typeof value === "number" ? value : Number(value);
    return legacyYuanToCents(numberValue, { allowNegative: field.allowNegative });
  }
  return field.allowNegative ? signedMoneyToCents(value) : moneyToCents(value);
}

export function getMoneyInventorySummary() {
  const byStorage: Record<MoneyStorageKind, number> = { legacy_int_yuan: 0, decimal_yuan: 0 };
  const byDomain: Record<string, number> = {};
  for (const field of MONEY_FIELD_REGISTRY) {
    byStorage[field.storage] += 1;
    byDomain[field.domain] = (byDomain[field.domain] ?? 0) + 1;
  }
  return { total: MONEY_FIELD_REGISTRY.length, byStorage, byDomain };
}

export type MoneyInvariantFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export function evaluateMoneyInvariantCounts(counts: Record<string, number>): MoneyInvariantFinding[] {
  const definitions: [string, MoneyInvariantFinding["severity"], string][] = [
    ["negative_unsigned_money", "error", "存在不允许为负数的金额"],
    ["need_budget_reversed", "error", "存在最低预算大于最高预算的需求"],
    ["listing_min_above_price", "error", "存在最低接受价高于挂牌价的物品"],
    ["milestone_sum_above_project", "error", "存在里程碑金额合计超过项目总额的项目"],
    ["payment_order_mismatch", "error", "存在支付金额与订单金额不一致的记录"],
    ["refund_above_payment", "error", "存在成功退款合计超过支付金额的记录"],
    ["escrow_components_invalid", "error", "存在托管入账、释放或退款金额越界的记录"],
    ["zero_required_money", "warning", "存在业务上通常应大于零但为零的必填金额"],
  ];
  return definitions
    .filter(([code]) => (counts[code] ?? 0) > 0)
    .map(([code, severity, message]) => ({ code, severity, message: `${message}：${counts[code]}` }));
}
