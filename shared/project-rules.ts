export const EDITABLE_QUOTE_STATUSES = ["submitted", "viewed", "negotiating"] as const;

export function canCreateQuoteVersion(status: string): boolean {
  return EDITABLE_QUOTE_STATUSES.includes(status as (typeof EDITABLE_QUOTE_STATUSES)[number]);
}

export function projectAgreementStatus(ownerConfirmed: boolean, engineerConfirmed: boolean) {
  return ownerConfirmed && engineerConfirmed ? "pending_payment" as const : "pending_agreement" as const;
}

export function applyProjectAmountDelta(currentAmount: number, amountDelta: number): number {
  if (!Number.isSafeInteger(currentAmount) || !Number.isSafeInteger(amountDelta)) {
    throw new Error("项目金额必须是安全整数");
  }
  return Math.max(0, currentAmount + amountDelta);
}

export function addScheduleDays(date: Date | null | undefined, deltaDays: number): Date | undefined {
  if (!date) return undefined;
  if (!Number.isInteger(deltaDays) || Math.abs(deltaDays) > 3650) throw new Error("工期变化天数无效");
  return new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
}

export function validateProjectFileSize(sizeBytes: number, maxBytes = 8 * 1024 * 1024): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("文件内容为空");
  if (sizeBytes > maxBytes) throw new Error("单个文件不能超过8MB");
}
