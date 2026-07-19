const UNSIGNED_MONEY_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const SIGNED_MONEY_PATTERN = /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

export type MoneyInput = string | number;

export type ParseMoneyOptions = {
  allowNegative?: boolean;
  allowZero?: boolean;
};

function normalizeMoneyInput(value: MoneyInput): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("金额必须是有限数字");
    // String() deliberately keeps floating-point drift visible instead of silently rounding it.
    return String(value);
  }
  return value.trim();
}

/**
 * Parse a major-unit money value (CNY yuan) into exact integer minor units (fen).
 * Public APIs should prefer decimal strings; numbers are accepted for legacy integer callers.
 */
export function parseMoneyToMinorUnits(value: MoneyInput, options: ParseMoneyOptions = {}): bigint {
  const normalized = normalizeMoneyInput(value);
  const pattern = options.allowNegative ? SIGNED_MONEY_PATTERN : UNSIGNED_MONEY_PATTERN;
  if (!pattern.test(normalized)) throw new Error("金额格式不正确，最多保留两位小数");

  const negative = normalized.startsWith("-");
  const absolute = negative ? normalized.slice(1) : normalized;
  const [yuan, fraction = ""] = absolute.split(".");
  const minorUnits = BigInt(yuan) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -minorUnits : minorUnits;

  if (options.allowZero === false && signed === 0n) throw new Error("金额必须大于 0");
  return signed;
}

/** Backward-compatible alias used by the V3.1/V3.2 finance services. */
export function moneyToCents(value: MoneyInput): bigint {
  return parseMoneyToMinorUnits(value);
}

export function signedMoneyToCents(value: MoneyInput): bigint {
  return parseMoneyToMinorUnits(value, { allowNegative: true });
}

export function minorUnitsToMoney(minorUnits: bigint, options: { allowNegative?: boolean } = {}): string {
  if (minorUnits < 0n && !options.allowNegative) throw new Error("金额不能为负数");
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const yuan = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${yuan}.${fraction}`;
}

export function centsToMoney(cents: bigint): string {
  return minorUnitsToMoney(cents);
}

export function signedCentsToMoney(cents: bigint): string {
  return minorUnitsToMoney(cents, { allowNegative: true });
}

export function normalizeMoney(value: MoneyInput): string {
  return centsToMoney(moneyToCents(value));
}

export function normalizeSignedMoney(value: MoneyInput): string {
  return signedCentsToMoney(signedMoneyToCents(value));
}

export function addMoney(...values: MoneyInput[]): string {
  return signedCentsToMoney(values.reduce((sum, value) => sum + signedMoneyToCents(value), 0n));
}

export function subtractMoney(left: MoneyInput, right: MoneyInput): string {
  const result = moneyToCents(left) - moneyToCents(right);
  if (result < 0n) throw new Error("金额不足");
  return centsToMoney(result);
}

export function assertMoneyEqual(left: MoneyInput, right: MoneyInput, message = "金额不一致") {
  if (moneyToCents(left) !== moneyToCents(right)) throw new Error(message);
}

export function assertMoneyNotGreater(value: MoneyInput, maximum: MoneyInput, message = "金额超过可用金额") {
  if (moneyToCents(value) > moneyToCents(maximum)) throw new Error(message);
}

export function assertPositiveMoney(value: MoneyInput, message = "金额必须大于 0") {
  if (moneyToCents(value) <= 0n) throw new Error(message);
}

/** V3.2 legacy INT business fields still require whole CNY until the cutover phase. */
export function assertWholeYuan(value: MoneyInput) {
  if (moneyToCents(value) % 100n !== 0n) throw new Error("当前版本仅支持整元金额");
}

/** Convert a legacy INT-yuan value to canonical integer fen without floating-point arithmetic. */
export function legacyYuanToCents(value: number, options: { allowNegative?: boolean } = {}): bigint {
  if (!Number.isSafeInteger(value)) throw new Error("历史整元金额必须是安全整数");
  if (value < 0 && !options.allowNegative) throw new Error("金额不能为负数");
  return BigInt(value) * 100n;
}

/** Convert canonical integer fen back to a legacy INT-yuan value during compatibility checks. */
export function centsToLegacyYuan(value: bigint, options: { allowNegative?: boolean } = {}): number {
  if (value < 0n && !options.allowNegative) throw new Error("金额不能为负数");
  if (value % 100n !== 0n) throw new Error("分金额无法无损转换为整元");
  const yuan = value / 100n;
  if (yuan > MAX_SAFE_MINOR_UNITS || yuan < -MAX_SAFE_MINOR_UNITS) throw new Error("金额超过 JavaScript 安全整数范围");
  return Number(yuan);
}

export function assertSafeMinorUnits(value: bigint): number {
  if (value > MAX_SAFE_MINOR_UNITS || value < -MAX_SAFE_MINOR_UNITS) {
    throw new Error("分金额超过 JavaScript 安全整数范围");
  }
  return Number(value);
}
