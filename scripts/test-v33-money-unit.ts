import assert from "node:assert/strict";
import {
  assertSafeMinorUnits,
  centsToLegacyYuan,
  legacyYuanToCents,
  moneyToCents,
  normalizeMoney,
  normalizeSignedMoney,
  parseMoneyToMinorUnits,
} from "../server/domain/money";
import {
  MONEY_FIELD_REGISTRY,
  evaluateMoneyInvariantCounts,
  getMoneyInventorySummary,
  moneyFieldKey,
  sourceValueToCents,
} from "../server/domain/money-migration";

assert.equal(moneyToCents("0.01"), 1n);
assert.equal(moneyToCents("12.30"), 1230n);
assert.equal(normalizeMoney("12.3"), "12.30");
assert.equal(normalizeSignedMoney("-12.3"), "-12.30");
assert.equal(parseMoneyToMinorUnits("-0.01", { allowNegative: true }), -1n);
assert.throws(() => moneyToCents("1.001"), /最多保留两位小数/);
assert.throws(() => moneyToCents(0.1 + 0.2), /金额格式不正确/);
assert.throws(() => parseMoneyToMinorUnits("0", { allowZero: false }), /必须大于 0/);
assert.equal(legacyYuanToCents(3800), 380000n);
assert.equal(legacyYuanToCents(-20, { allowNegative: true }), -2000n);
assert.equal(centsToLegacyYuan(380000n), 3800);
assert.throws(() => centsToLegacyYuan(1n), /无法无损转换/);
assert.equal(assertSafeMinorUnits(9007199254740991n), Number.MAX_SAFE_INTEGER);
assert.throws(() => assertSafeMinorUnits(9007199254740992n), /安全整数范围/);

const keys = MONEY_FIELD_REGISTRY.map(moneyFieldKey);
assert.equal(new Set(keys).size, keys.length, "金额字段注册表存在重复项");
assert.equal(keys.includes("orders.amount"), true);
assert.equal(keys.includes("payments.amount"), true);
assert.equal(sourceValueToCents(MONEY_FIELD_REGISTRY.find((item) => moneyFieldKey(item) === "orders.amount")!, 100), 10000n);
assert.equal(sourceValueToCents(MONEY_FIELD_REGISTRY.find((item) => moneyFieldKey(item) === "payments.amount")!, "100.01"), 10001n);

const summary = getMoneyInventorySummary();
assert.equal(summary.total, 30);
assert.equal(summary.byStorage.legacy_int_yuan, 17);
assert.equal(summary.byStorage.decimal_yuan, 13);

const findings = evaluateMoneyInvariantCounts({ payment_order_mismatch: 2, zero_required_money: 1 });
assert.deepEqual(findings.map((item) => item.severity), ["error", "warning"]);
assert.equal(evaluateMoneyInvariantCounts({}).length, 0);

console.log(JSON.stringify({ status: "PASSED", inventory: summary }, null, 2));
